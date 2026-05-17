/**
 * Voice Clone API
 *
 * GET    /api/voice/clone           — list user's cloned voice samples (newest first)
 * POST   /api/voice/clone           — multipart upload of audio sample + name → ElevenLabs clone
 * DELETE /api/voice/clone?id=xxx    — delete a cloned voice sample row (RLS-enforced)
 * PATCH  /api/voice/clone           — set a sample as default; clears default on the user's other rows
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
const PREVIEW_TEXT = 'გამარჯობა, ეს თქვენი კლონირებული ხმაა.';
const PREVIEW_MODEL = 'eleven_multilingual_v2';

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

    return NextResponse.json({ samples: (data ?? []) as VoiceSampleRow[] });
  } catch (error) {
    reportError(error, { route: '/api/voice/clone', op: 'GET' });
    return NextResponse.json({ error: 'Failed to list voice samples' }, { status: 500 });
  }
}

// ── POST: upload audio → clone via ElevenLabs ────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
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

    const form = await request.formData();
    const audio = form.get('audio');
    const name = String(form.get('name') ?? '').trim();

    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: 'audio is required' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // 1. Submit to ElevenLabs to create the voice clone
    const cloneForm = new FormData();
    cloneForm.append('name', name);
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
      return NextResponse.json(
        { error: 'Voice clone provider rejected the sample', detail: errBody.slice(0, 200) },
        { status: 502 },
      );
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

      if (ttsRes.ok) {
        const buf = Buffer.from(await ttsRes.arrayBuffer());
        const storage = createServiceRoleClient();
        const path = `voices/${user.id}/${voiceId}.mp3`;
        const { error: uploadErr } = await storage.storage
          .from('media')
          .upload(path, buf, {
            contentType: 'audio/mpeg',
            upsert: true,
          });

        if (uploadErr) {
          reportError(uploadErr, {
            route: '/api/voice/clone',
            op: 'preview-upload',
            userId: user.id,
            voiceId,
          });
        } else {
          const { data: signed } = await storage.storage
            .from('media')
            .createSignedUrl(path, 60 * 60 * 24 * 365);
          previewUrl = signed?.signedUrl ?? null;
        }
      } else {
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

// ── DELETE: remove a sample row (RLS-enforced) ───────────────────────────────
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

    const { error } = await supabase
      .from('voice_samples')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      reportError(error, { route: '/api/voice/clone', op: 'DELETE', userId: user.id, id });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: id });
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
