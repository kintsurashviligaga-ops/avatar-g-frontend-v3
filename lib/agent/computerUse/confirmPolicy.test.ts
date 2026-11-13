/** @jest-environment node */
import { judgeAction, pendingConfirmation, resolveConfirmation, actionHash, CONFIRM_TTL_MS, CU_MAX_ACTIONS, type ProposedAction } from './confirmPolicy';

const ctx = { index: 0, elapsedSec: 0, currentHost: 'www.gg.ge' };
const click: ProposedAction = { name: 'click_at', args: { x: 10, y: 20 } };

test('a plain click or scroll is allowed', () => {
  expect(judgeAction(click, ctx)).toEqual({ verdict: 'allow' });
  expect(judgeAction({ name: 'scroll_document', args: { direction: 'down' } }, ctx)).toEqual({ verdict: 'allow' });
});

test('the model asking, or a decision we do not know, always pauses for the user (fail closed)', () => {
  expect(judgeAction({ ...click, safetyDecision: { decision: 'require_confirmation', explanation: 'checkout' } }, ctx))
    .toEqual({ verdict: 'confirm', reason: 'model_requires_confirmation' });
  expect(judgeAction({ ...click, safetyDecision: { decision: 'something_new' } }, ctx))
    .toEqual({ verdict: 'confirm', reason: 'unknown_safety_decision' });
});

test('unknown actions, private hosts, bad urls and over-budget runs are refused', () => {
  expect(judgeAction({ name: 'run_shell', args: {} }, ctx)).toMatchObject({ verdict: 'refuse', reason: 'unknown_action' });
  for (const url of ['http://localhost/x', 'http://169.254.169.254/', 'http://metadata.google.internal/', 'https://intranet.corp/'])
    expect(judgeAction({ name: 'navigate', args: { url } }, ctx)).toMatchObject({ verdict: 'refuse', reason: 'not_public_host' });
  expect(judgeAction({ name: 'navigate', args: { url: 'file:///etc/passwd' } }, ctx)).toMatchObject({ verdict: 'refuse', reason: 'bad_args' });
  expect(judgeAction({ name: 'navigate', args: { url: 'https://u:p@gg.ge/' } }, ctx)).toMatchObject({ verdict: 'refuse', reason: 'bad_args' });
  expect(judgeAction(click, { ...ctx, index: CU_MAX_ACTIONS })).toMatchObject({ verdict: 'refuse', reason: 'over_budget' });
  expect(judgeAction(click, { ...ctx, elapsedSec: 999 })).toMatchObject({ verdict: 'refuse', reason: 'over_budget' });
});

test('typing into a secret or card field, and pay/send/delete clicks (ka/ru/en), need a tap', () => {
  const type: ProposedAction = { name: 'type_text_at', args: { x: 1, y: 1, text: 'hunter2' } };
  expect(judgeAction(type, { ...ctx, target: { type: 'password' } })).toMatchObject({ verdict: 'confirm', reason: 'secret_field' });
  expect(judgeAction(type, { ...ctx, target: { autocomplete: 'cc-number', label: 'Card number' } })).toMatchObject({ reason: 'secret_field' });
  expect(judgeAction(type, { ...ctx, target: { label: 'Search' } })).toEqual({ verdict: 'allow' });
  for (const label of ['Pay now', 'გადახდა', 'Оплатить', 'Delete account', 'Send'])
    expect(judgeAction(click, { ...ctx, target: { label } })).toMatchObject({ verdict: 'confirm', reason: 'risky_action' });
});

test('navigating to another site pauses; staying on the same site does not', () => {
  expect(judgeAction({ name: 'navigate', args: { url: 'https://shop.example.com/' } }, ctx)).toMatchObject({ reason: 'leaves_site' });
  expect(judgeAction({ name: 'navigate', args: { url: 'https://news.gg.ge/a' } }, ctx)).toEqual({ verdict: 'allow' });
});

describe('confirmation', () => {
  const held: ProposedAction = { ...click, safetyDecision: { decision: 'require_confirmation' } };
  const p = pendingConfirmation('run1', 3, held, 1_000);
  const tap = { via: 'tap' as const, runId: 'run1', actionIndex: 3, actionHash: actionHash(held), approve: true };

  test('only a tap on this exact action, in time, runs it, and only then is Google acknowledged', () => {
    expect(resolveConfirmation(p, tap, 2_000)).toEqual({ run: true, acknowledge: true });
    expect(resolveConfirmation(p, { ...tap, via: 'text' }, 2_000)).toMatchObject({ run: false, why: 'not_a_tap' });
    expect(resolveConfirmation(p, { ...tap, via: 'model' }, 2_000)).toMatchObject({ run: false, why: 'not_a_tap' });
    expect(resolveConfirmation(p, { ...tap, actionIndex: 4 }, 2_000)).toMatchObject({ why: 'mismatch' });
    expect(resolveConfirmation(p, { ...tap, actionHash: actionHash({ name: 'click_at', args: { x: 99, y: 20 } }) }, 2_000)).toMatchObject({ why: 'mismatch' });
    expect(resolveConfirmation(p, tap, 1_000 + CONFIRM_TTL_MS + 1)).toMatchObject({ why: 'expired' });
    expect(resolveConfirmation(p, { ...tap, approve: false }, 2_000)).toMatchObject({ why: 'declined' });
  });

  test('an action we held ourselves runs on a tap but sends no acknowledgement Google never asked for', () => {
    const own = pendingConfirmation('run1', 3, click, 1_000);
    expect(resolveConfirmation(own, { ...tap, actionHash: actionHash(click) }, 2_000)).toEqual({ run: true, acknowledge: false });
  });

  test('the hash ignores key order but not values', () => {
    expect(actionHash({ name: 'click_at', args: { y: 20, x: 10 } })).toBe(actionHash(click));
    expect(actionHash({ name: 'click_at', args: { x: 11, y: 20 } })).not.toBe(actionHash(click));
  });
});
