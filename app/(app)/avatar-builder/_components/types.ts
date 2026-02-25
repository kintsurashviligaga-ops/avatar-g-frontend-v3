export type AvatarGoal = 'personal' | 'business' | 'team';
export type AvatarType = 'scan' | 'studio' | 'stylized' | 'fast';
export type InputMethod =
  | '3d_upload'
  | 'phone_scan'
  | 'photo_set'
  | 'video_capture'
  | 'selfie_pack'
  | 'text_to_avatar';

export type BackgroundOption = 'transparent' | 'studio' | 'none';

export interface OutputOptionsState {
  fullBody: boolean;
  background: BackgroundOption;
  rigging: boolean;
}

export interface AvatarBuilderDraft {
  avatar_goal: AvatarGoal;
  avatar_type: AvatarType;
  input_method: InputMethod;
  notes: string;
  text_prompt: string;
  output_options: OutputOptionsState;
}
