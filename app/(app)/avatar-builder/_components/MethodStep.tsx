import { InputMethod } from './types';

type MethodStepProps = {
  value: InputMethod;
  onChange: (nextMethod: InputMethod) => void;
};

const METHODS: Array<{ key: InputMethod; label: string; rule: string }> = [
  { key: '3d_upload', label: '3D Upload', rule: '1 ფაილი (.glb/.gltf/.fbx/.obj), მაქს 200MB' },
  { key: 'phone_scan', label: 'Phone Scan', rule: 'ან 1-3 ვიდეო, ან 20-80 ფოტო' },
  { key: 'photo_set', label: 'Photo Set', rule: '12-30 ფოტო (.jpg/.png)' },
  { key: 'video_capture', label: 'Video Capture', rule: '1 ვიდეო (.mp4/.mov)' },
  { key: 'selfie_pack', label: 'Selfie Pack', rule: '6-12 სელფი (.jpg/.png)' },
  { key: 'text_to_avatar', label: 'Text to Avatar', rule: 'ფაილი არ არის საჭირო, საჭიროა ტექსტური აღწერა' },
];

export function MethodStep({ value, onChange }: MethodStepProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {METHODS.map((method) => {
        const selected = method.key === value;

        return (
          <button
            key={method.key}
            type="button"
            onClick={() => onChange(method.key)}
            className={`rounded-xl border p-4 text-left transition ${
              selected ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 bg-white/5 hover:border-cyan-500/40'
            }`}
          >
            <h3 className="text-base font-semibold text-white">{method.label}</h3>
            <p className="mt-2 text-sm text-slate-300">{method.rule}</p>
          </button>
        );
      })}
    </div>
  );
}
