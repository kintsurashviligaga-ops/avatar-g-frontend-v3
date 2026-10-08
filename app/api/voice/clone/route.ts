/**
 * Voice Clone API
 *
 * GET    /api/voice/clone           — list user's cloned voice samples (newest first)
 * POST   /api/voice/clone           — multipart upload of audio sample (audio/*, ≤ 10 MB) + name → ElevenLabs clone
 * DELETE /api/voice/clone?id=xxx    — delete the voice at ElevenLabs (when it is provably this user's), then the row
 * PATCH  /api/voice/clone           — set a sample as default; clears default on the user's other rows
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import {
  createSignedAssetUrl,
  describeSupabaseObjectUrl,
  ownStorageHosts,
  removeStorageObjects,
  uploadAndSign,
} from '@/lib/orchestrator/storage-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
const PREVIEW_TEXT = 'გამარჯობა, ეს თქვენი კლონირებული ხმაა.';
const PREVIEW_MODEL = 'eleven_multilingual_v2';
const MAX_SAMPLE_BYTES = 10 * 1024 * 1024;
/** Room for the multipart framing + the name field around the sample in the Content-Length pre-check. */
const MULTIPART_SLACK_BYTES = 64 * 1024;
const MAX_NAME_CHARS = 100;
const PROVIDER_TIMEOUT_MS = 15_000;
/** ElevenLabs voice ids are short alphanumerics; anything else never reaches a provider URL path. */
const VOICE_ID_RE = /^[A-Za-z0-9]{1,64}$/;
const OWNER_TAG_RE = /myavatar-owner:([0-9a-f-]{36})/i;
/** The one object path a preview clip is ever stored at: `voices/<user id>/<voice id>.mp3`. */
const PREVIEW_PATH_RE = /^voices\/([0-9a-f-]{36})\/[A-Za-z0-9]{1,64}\.mp3$/i;
/** A preview link is minted fresh on every list, so it only has to outlive one Voice Lab session. */
const PREVIEW_LINK_TTL_SEC = 6 * 60 * 60;

/**
 * Where preview clips live: the private upload bucket. ⚠️ They used to go to a `media` bucket that Production does not
 * have, so every upload failed and no clone ever had a preview (checked live 2026-10-08).
 */
function previewBucket(): string {
  return process.env.UPLOAD_BUCKET?.trim() || 'uploads';
}

function previewPath(userId: string, voiceId: string): string {
  return `voices/${userId}/${voiceId}.mp3`;
}

/**
 * A fresh link to the caller's OWN preview clip, or null.
 *
 * ⚠️ preview_url IS USER-WRITABLE (voice_samples RLS lets an owner update their row through PostgREST) and the link
 * is signed with the service role. Signing whatever object the row names would let any signed-in user read any file
 * in storage, so only the exact path POST writes for this caller, in our own project and bucket, is ever signed.
 */
async function previewLink(stored: unknown, userId: string): Promise<string | null> {
  if (typeof stored !== 'string' || !stored) return null;
  const ref = describeSupabaseObjectUrl(stored);
  if (!ref || !ownStorageHosts().has(ref.host) || ref.bucket !== previewBucket()) return null;
  const owner = ref.path.match(PREVIEW_PATH_RE)?.[1];
  if (!owner || owner.toLowerCase() !== userId.toLowerCase()) return null;
  return createSignedAssetUrl(ref.bucket, ref.path, PREVIEW_LINK_TTL_SEC);
}

/**
 * The description every clone is created with. It is the ONLY proof DELETE accepts that a provider voice belongs to
 * the caller — see `removeProviderVoice`.
 */
function ownerDescription(userId: string): string {
  return `MyAvatar voice clone · myavatar-owner:${userId}`;
}

type ProviderDelete = 'deleted' | 'gone' | 'error';

/** ElevenLabs answers an unknown voice with 404, or 400 `voice_not_found` on some endpoints — both mean "gone". */
async function isVoiceGone(res: Response): Promise<boolean> {
  if (res.status === 404) return true;
  if (res.status !== 400) return false;
  const body = await res.text().catch(() => '');
  return /voice_not_found/i.test(body);
}

/** DELETE /v1/voices/{id}. 'gone' = the provider no longer has it (already deleted) — as good as deleted. */
async function deleteVoiceAtProvider(apiKey: string, voiceId: string): Promise<ProviderDelete> {
  if (!VOICE_ID_RE.test(voiceId)) return 'error';
  try {
    const res = await fetch(`${ELEVENLABS_BASE}/voices/${voiceId}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (res.ok) return 'deleted';
    return (await isVoiceGone(res)) ? 'gone' : 'error';
  } catch {
    return 'error';
  }
}

/**
 * Delete the provider voice behind a row — but ONLY when ElevenLabs itself says the voice was cloned for `userId`.
 *
 * ⚠️ THE ROW'S external_id IS USER-WRITABLE. voice_samples RLS lets an owner INSERT/UPDATE their own rows straight
 * through PostgREST with the public anon key, so `external_id` can name ANY voice in our ElevenLabs account — the
 * native Georgian voices every ka synthesis uses (lib/audio/georgian-voice.ts), the narrators, another user's clone.
 * Deleting whatever the row names would hand every signed-in user a "delete the platform's voices" button. So the
 * proof lives provider-side, where only our key can write: the owner tag POST puts in the voice's description.
 * A voice without this caller's tag (a legacy clone from before the tag, or anything that isn't theirs) is left
 * alone — 'skipped' — and only the row goes.
 */
async function removeProviderVoice(
  apiKey: string,
  voiceId: string,
  userId: string,
): Promise<ProviderDelete | 'skipped'> {
  if (!VOICE_ID_RE.test(voiceId)) return 'skipped';
  let description = '';
  try {
    const res = await fetch(`${ELEVENLABS_BASE}/voices/${voiceId}`, {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return (await isVoiceGone(res)) ? 'gone' : 'error';
    const voice = (await res.json().catch(() => null)) as { description?: unknown } | null;
    description = typeof voice?.description === 'string' ? voice.description : '';
  } catch {
    return 'error';
  }
  const owner = description.match(OWNER_TAG_RE)?.[1]?.toLowerCase();
  if (owner !== userId.toLowerCase()) return 'skipped';
  return deleteVoiceAtProvider(apiKey, voiceId);
}

interface VoiceSampleRow {
  id: string;
  user_id: string;
  name: string;
  provider: string;
  external_id: string;
  preview_url: string | null;
  is_default: boolean;
  created_at: string;
}

// ── GET: list samples ────────────────────────────────────────────────────────
export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('voice_samples')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      reportError(error, { route: '/api/voice/clone', op: 'GET', userId: user.id });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const samples = await Promise.all(
      ((data ?? []) as VoiceSampleRow[]).map(async (row) => ({ ...row, preview_url: await previewLink(row.preview_url, user.id) })),
    );
    return NextResponse.json({ samples });
  } catch (error) {
    reportError(error, { route: '/api/voice/clone', op: 'GET' });
    return NextResponse.json({ error: 'Failed to list voice samples' }, { status: 500 });
  }
}

// ── POST: upload audio → clone via ElevenLabs ────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Every POST is a paid ElevenLabs clone + a preview synthesis on the platform's key.
  const rl = await checkRateLimit(request, RATE_LIMITS.EXPENSIVE);
  if (rl) return rl;
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Voice provider not configured' }, { status: 500 });
    }

    // An honest Content-Length over the cap is refused before the multipart body is buffered; the parsed size
    // check below catches the rest (chunked / lying headers).
    const declared = Number(request.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > MAX_SAMPLE_BYTES + MULTIPART_SLACK_BYTES) {
      return NextResponse.json({ error: 'Audio sample is too large (max 10 MB)' }, { status: 413 });
    }

    const form = await request.formData();
    const audio = form.get('audio');
    const name = String(form.get('name') ?? '').trim().slice(0, MAX_NAME_CHARS);

    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: 'audio is required' }, { status: 400 });
    }
    if (audio.size > MAX_SAMPLE_BYTES) {
      return NextResponse.json({ error: 'Audio sample is too large (max 10 MB)' }, { status: 413 });
    }
    if (!audio.type.toLowerCase().startsWith('audio/')) {
      return NextResponse.json({ error: 'Only audio files can be cloned' }, { status: 415 });
    }
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // 1. Submit to ElevenLabs to create the voice clone
    const cloneForm = new FormData();
    cloneForm.append('name', name);
    cloneForm.append('description', ownerDescription(user.id));
    cloneForm.append(
      'files',
      audio,
      audio instanceof File && audio.name ? audio.name : 'sample.webm',
    );

    const cloneRes = await fetch(`${ELEVENLABS_BASE}/voices/add`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: cloneForm,
    });

    if (!cloneRes.ok) {
      const errBody = await cloneRes.text().catch(() => '');
      reportError(new Error('ElevenLabs clone failed'), {
        route: '/api/voice/clone',
        status: cloneRes.status,
        body: errBody.slice(0, 200),
        userId: user.id,
      });
      // The provider's body stays in the server log — it never reaches the user (lib/api/providerError.ts).
      return NextResponse.json({ error: 'Voice clone provider rejected the sample' }, { status: 502 });
    }

    const cloneJson = (await cloneRes.json()) as { voice_id?: string };
    const voiceId = cloneJson.voice_id;
    if (!voiceId) {
      return NextResponse.json({ error: 'Provider did not return a voice_id' }, { status: 502 });
    }

    // 2. Generate a short preview clip
    let previewUrl: string | null = null;
    try {
      const ttsRes = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: PREVIEW_TEXT,
          model_id: PREVIEW_MODEL,
        }),
      });

      if (ttsRes.ok && VOICE_ID_RE.test(voiceId)) {
        const buf = Buffer.from(await ttsRes.arrayBuffer());
        previewUrl = await uploadAndSign(
          previewBucket(),
          previewPath(user.id, voiceId),
          buf.toString('base64'),
          'audio/mpeg',
          PREVIEW_LINK_TTL_SEC,
        );
        if (!previewUrl) {
          reportError(new Error('Preview upload failed'), {
            route: '/api/voice/clone',
            op: 'preview-upload',
            userId: user.id,
            voiceId,
          });
        }
      } else if (!ttsRes.ok) {
        const detail = await ttsRes.text().catch(() => '');
        reportError(new Error('Preview synth failed'), {
          route: '/api/voice/clone',
          status: ttsRes.status,
          detail: detail.slice(0, 200),
          userId: user.id,
        });
      }
    } catch (previewErr) {
      reportError(previewErr, {
        route: '/api/voice/clone',
        op: 'preview',
        userId: user.id,
        voiceId,
      });
    }

    // 3. Persist row using the user-scoped client (RLS-enforced)
    const { data: inserted, error: insertErr } = await supabase
      .from('voice_samples')
      .insert({
        user_id: user.id,
        name,
        provider: 'elevenlabs',
        external_id: voiceId,
        preview_url: previewUrl,
        is_default: false,
      })
      .select('*')
      .single();

    if (insertErr || !inserted) {
      reportError(insertErr ?? new Error('insert failed'), {
        route: '/api/voice/clone',
        op: 'insert',
        userId: user.id,
        voiceId,
      });
      // No row → nothing could ever delete this voice later. We created it a moment ago, so it is ours to remove.
      await deleteVoiceAtProvider(apiKey, voiceId);
      return NextResponse.json({ error: 'Failed to save voice sample' }, { status: 500 });
    }

    return NextResponse.json(
      {
        voiceId,
        previewUrl,
        sample: inserted as VoiceSampleRow,
      },
      { status: 201 },
    );
  } catch (error) {
    reportError(error, { route: '/api/voice/clone', op: 'POST' });
    return NextResponse.json({ error: 'Failed to clone voice' }, { status: 500 });
  }
}

// ── DELETE: remove the provider voice, then the row (RLS-enforced) ───────────
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const { data: row, error: lookupErr } = await supabase
      .from('voice_samples')
      .select('id, provider, external_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (lookupErr) {
      reportError(lookupErr, { route: '/api/voice/clone', op: 'DELETE-lookup', userId: user.id, id });
      return NextResponse.json({ error: 'Failed to delete sample' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 });
    }

    // ⚠️ PROVIDER FIRST, ROW SECOND. The row is our only pointer to the cloned voice: dropping it first left the
    // voice — the user's own biometric sample — on ElevenLabs for good, holding one of the account's voice slots.
    // If the provider delete fails, the row stays so the user can simply press delete again.
    let providerDeleted = false;
    const sample = row as Pick<VoiceSampleRow, 'id' | 'provider' | 'external_id'>;
    if (sample.provider === 'elevenlabs') {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: 'Voice provider not configured' }, { status: 503 });
      }
      const outcome = await removeProviderVoice(apiKey, sample.external_id, user.id);
      if (outcome === 'error') {
        reportError(new Error('ElevenLabs voice delete failed'), {
          route: '/api/voice/clone',
          op: 'DELETE-provider',
          userId: user.id,
          id,
          voiceId: sample.external_id,
        });
        return NextResponse.json({ error: 'Could not delete the voice — please try again' }, { status: 502 });
      }
      if (outcome === 'skipped') {
        // Not provably this user's (a legacy clone from before the owner tag, or a row naming someone else's
        // voice): left at the provider on purpose. Logged so the owner can purge legacy orphans by hand.
        console.warn('[voice/clone] DELETE left the provider voice untouched (no owner tag)', {
          userId: user.id,
          voiceId: sample.external_id,
        });
      }
      providerDeleted = outcome === 'deleted' || outcome === 'gone';
    }

    const { error } = await supabase
      .from('voice_samples')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      reportError(error, { route: '/api/voice/clone', op: 'DELETE', userId: user.id, id });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // The preview clip goes with the row. Only ever the caller's own folder: external_id is user-writable.
    if (VOICE_ID_RE.test(sample.external_id)) {
      await removeStorageObjects(previewBucket(), [previewPath(user.id, sample.external_id)]);
    }

    return NextResponse.json({ deleted: id, providerDeleted });
  } catch (error) {
    reportError(error, { route: '/api/voice/clone', op: 'DELETE' });
    return NextResponse.json({ error: 'Failed to delete sample' }, { status: 500 });
  }
}

// ── PATCH: set default ───────────────────────────────────────────────────────
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = body.id;
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    // 1. Ensure the row belongs to this user
    const { data: target, error: lookupErr } = await supabase
      .from('voice_samples')
      .select('id, external_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (lookupErr || !target) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 });
    }

    // 2. Clear default on all other rows for this user, then set the target row.
    const { error: clearErr } = await supabase
      .from('voice_samples')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .neq('id', id);

    if (clearErr) {
      reportError(clearErr, { route: '/api/voice/clone', op: 'PATCH-clear', userId: user.id });
      return NextResponse.json({ error: clearErr.message }, { status: 500 });
    }

    const { error: setErr } = await supabase
      .from('voice_samples')
      .update({ is_default: true })
      .eq('id', id)
      .eq('user_id', user.id);

    if (setErr) {
      reportError(setErr, { route: '/api/voice/clone', op: 'PATCH-set', userId: user.id });
      return NextResponse.json({ error: setErr.message }, { status: 500 });
    }

    // 3. Best-effort: update the user's avatar row(s) if the `avatars` table
    //    has a column suitable for storing the default voice. Done via the
    //    service-role client so the update isn't blocked by RLS, but scoped
    //    to the authenticated user_id. Silently skip when the column or table
    //    isn't present so we never fail the user-visible action.
    try {
      const admin = createServiceRoleClient();
      // We try a couple of common column names; ignore failures.
      const candidateColumns = ['default_voice_id', 'voice_id', 'voice_sample_id'];
      for (const col of candidateColumns) {
        const { error: avErr } = await admin
          .from('avatars')
          .update({ [col]: target.external_id })
          .eq('user_id', user.id);
        if (!avErr) break;
      }
    } catch (avatarErr) {
      reportError(avatarErr, {
        route: '/api/voice/clone',
        op: 'PATCH-avatar-update',
        userId: user.id,
        note: 'best-effort avatar update; ignore',
      });
    }

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    reportError(error, { route: '/api/voice/clone', op: 'PATCH' });
    return NextResponse.json({ error: 'Failed to set default voice' }, { status: 500 });
  }
}
