/**
 * browserNotify — verifies the honest capability boundary + fail-safe behavior of the native
 * render-complete notifications: it no-ops (never throws) where the API is unavailable (e.g. an
 * iOS Safari tab / SSR), prompts only once, and only fires when permission is actually granted.
 */
import { notificationsSupported, ensureNotificationPermission, fireCompletionNotification } from './browserNotify';

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = global as any;

describe('browserNotify — native render-complete notifications', () => {
  const original = g.Notification;
  afterEach(() => {
    g.Notification = original;
    jest.restoreAllMocks();
  });

  describe('when the Notification API is unavailable (iOS Safari tab / SSR)', () => {
    beforeEach(() => { delete g.Notification; });

    it('reports unsupported', () => {
      expect(notificationsSupported()).toBe(false);
    });
    it('ensureNotificationPermission resolves to "denied" without throwing', async () => {
      await expect(ensureNotificationPermission()).resolves.toBe('denied');
    });
    it('fireCompletionNotification no-ops without throwing', async () => {
      await expect(fireCompletionNotification({ title: 'MyAvatar', body: 'ready' })).resolves.toBeUndefined();
    });
  });

  describe('permission request rides a single gesture, never re-prompts', () => {
    it('requests exactly once when undecided, returning the result', async () => {
      const requestPermission = jest.fn().mockResolvedValue('granted');
      g.Notification = Object.assign(function () { /* ctor */ }, { permission: 'default', requestPermission });
      await expect(ensureNotificationPermission()).resolves.toBe('granted');
      expect(requestPermission).toHaveBeenCalledTimes(1);
    });
    it('does NOT re-prompt once granted', async () => {
      const requestPermission = jest.fn();
      g.Notification = Object.assign(function () {}, { permission: 'granted', requestPermission });
      await expect(ensureNotificationPermission()).resolves.toBe('granted');
      expect(requestPermission).not.toHaveBeenCalled();
    });
    it('does NOT re-prompt once denied', async () => {
      const requestPermission = jest.fn();
      g.Notification = Object.assign(function () {}, { permission: 'denied', requestPermission });
      await expect(ensureNotificationPermission()).resolves.toBe('denied');
      expect(requestPermission).not.toHaveBeenCalled();
    });
  });

  describe('firing a completion notification', () => {
    it('constructs a native Notification when granted (no service worker present)', async () => {
      const ctor = jest.fn();
      g.Notification = Object.assign(ctor, { permission: 'granted' });
      await fireCompletionNotification({ title: 'MyAvatar', body: 'Your video is ready! 🎬', tag: 'video' });
      expect(ctor).toHaveBeenCalledTimes(1);
      expect(ctor).toHaveBeenCalledWith('MyAvatar', expect.objectContaining({ body: 'Your video is ready! 🎬', tag: 'video' }));
    });
    it('does NOT fire unless permission is granted', async () => {
      const ctor = jest.fn();
      g.Notification = Object.assign(ctor, { permission: 'default' });
      await fireCompletionNotification({ title: 'MyAvatar', body: 'ready' });
      expect(ctor).not.toHaveBeenCalled();
    });
  });
});
