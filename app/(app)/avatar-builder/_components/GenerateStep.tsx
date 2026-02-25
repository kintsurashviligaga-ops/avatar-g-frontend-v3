import { AvatarBuilderDraft } from './types';
import { Button } from '@/components/ui/button';

type GenerateStepProps = {
  draft: AvatarBuilderDraft;
  fileCount: number;
  isGenerating: boolean;
  onGenerate: () => void;
};

export function GenerateStep({ draft, fileCount, isGenerating, onGenerate }: GenerateStepProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
        <p><span className="font-semibold text-cyan-200">Goal:</span> {draft.avatar_goal}</p>
        <p><span className="font-semibold text-cyan-200">Type:</span> {draft.avatar_type}</p>
        <p><span className="font-semibold text-cyan-200">Method:</span> {draft.input_method}</p>
        <p><span className="font-semibold text-cyan-200">Files:</span> {fileCount}</p>
        <p><span className="font-semibold text-cyan-200">Output:</span> fullBody={String(draft.output_options.fullBody)}, background={draft.output_options.background}, rigging={String(draft.output_options.rigging)}</p>
      </div>

      <div className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 p-4 text-sm text-slate-200">
        გენერაციის შემდეგ ფაილები აიტვირთება `avatars-input/{'{'}user_id{'}'}/{'{'}avatar_asset_id{'}'}` ბილიკზე, შემდეგ მოხდება `/api/avatar/upload-complete` გამოძახება.
      </div>

      <Button variant="primary" size="lg" onClick={onGenerate} disabled={isGenerating}>
        {isGenerating ? 'Processing...' : 'Generate Avatar'}
      </Button>
    </div>
  );
}
