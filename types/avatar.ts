/**
 * Avatar Builder — Shared types
 * Used by API routes, wizard UI, OrbitSolarSystem & CoreAvatar.
 */

/* ──────────────────── Enums / Literals ──────────────── */

export type AvatarGoal = 'personal' | 'business' | 'team';
export type AvatarType = 'scan' | 'studio' | 'stylized' | 'fast';
export type InputMethod =
  | '3d_upload'
  | 'phone_scan'
  | 'photo_set'
  | 'video_capture'
  | 'selfie_pack'
  | 'text_to_avatar';

export type AvatarAssetStatus = 'none' | 'processing' | 'ready' | 'failed';

/* ──────────────────── Output options ────────────────── */

export interface AvatarOutputOptions {
  fullBody: boolean;
  background: 'transparent' | 'studio' | 'none';
  rigging: boolean;
}

/* ──────────────────── Upload plan (from /api/avatar/create) ── */

export interface UploadPlan {
  requiredFilesCount: number;
  allowedExtensions: string[];
  maxFileSize: number;
  storagePathPrefix: string;
}

/* ──────────────────── API responses ─────────────────── */

export interface CreateAvatarResponse {
  avatarAssetId: string;
  uploadPlan: UploadPlan;
}

export interface CoreAvatarResponse {
  core_avatar_id: string | null;
  status: AvatarAssetStatus;
  model_glb_url: string | null;
  poster_url: string | null;
  updated_at: string | null;
}

/* ──────────────────── DB row (avatar_assets) ────────── */

export interface AvatarAsset {
  id: string;
  user_id: string;
  avatar_goal: AvatarGoal;
  avatar_type: AvatarType;
  input_method: InputMethod;
  status: AvatarAssetStatus;
  input_urls: string[] | null;
  model_glb_url: string | null;
  poster_url: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/* ──────────────────── Wizard state ──────────────────── */

export interface WizardDraft {
  avatarGoal: AvatarGoal | null;
  avatarType: AvatarType | null;
  inputMethod: InputMethod | null;
  outputOptions: AvatarOutputOptions;
  notes: string;
  textPrompt: string;
}

export const WIZARD_DRAFT_DEFAULTS: WizardDraft = {
  avatarGoal: null,
  avatarType: null,
  inputMethod: null,
  outputOptions: {
    fullBody: true,
    background: 'transparent',
    rigging: false,
  },
  notes: '',
  textPrompt: '',
};
