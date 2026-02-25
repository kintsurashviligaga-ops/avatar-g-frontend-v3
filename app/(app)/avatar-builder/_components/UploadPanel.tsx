import { ChangeEvent, DragEvent } from 'react';
import { InputMethod } from './types';
import { Textarea } from '@/components/ui/textarea';

export type UploadPanelProps = {
  method: InputMethod;
  files: File[];
  textPrompt: string;
  onTextPromptChange: (next: string) => void;
  onFilesAdded: (nextFiles: FileList | File[]) => void;
  onRemoveFile: (index: number) => void;
};

const TIPS: Record<InputMethod, string[]> = {
  '3d_upload': [
    'გამოიყენე clean mesh და ერთიანი მასშტაბი.',
    'ფაილს ჰქონდეს ერთმნიშვნელოვანი სახელი.',
    'ატვირთვამდე გადაამოწმე ტოპოლოგია და მასალები.',
  ],
  phone_scan: [
    'აირჩიე ერთი რეჟიმი: ვიდეოები ან ფოტოები.',
    'უზრუნველყავი კარგი განათება და ნელი მოძრაობა.',
    'ფოკუსი შეინარჩუნე სახესა და სხეულის მთლიან სილუეტზე.',
  ],
  photo_set: [
    'ფოტოები იყოს სხვადასხვა კუთხიდან.',
    'არ გამოიყენო მძიმე ფილტრები ან ბლური.',
    'სტაბილური განათება ზრდის შედეგის სიზუსტეს.',
  ],
  video_capture: [
    'ერთ ვიდეოში გააკეთე სრული ბრუნი.',
    'თითოეულ კადრში შეინარჩუნე მკაფიო ფოკუსი.',
    'ვიდეო არ უნდა იყოს ჭრილი ან აჩქარებული.',
  ],
  selfie_pack: [
    'მოამზადე სხვადასხვა ემოცია და კუთხე.',
    'ფონის სისუფთავე აუმჯობესებს ამოცნობას.',
    'აირჩიე მაღალი გარჩევადობის კადრები.',
  ],
  text_to_avatar: [
    'აღწერე სტილი, ფორმა და განწყობა.',
    'მიუთითე სქესი/სურათის ტიპი საჭიროებისამებრ.',
    'დაამატე სასურველი ფერები და ტანსაცმლის სტილი.',
  ],
};

function getAccept(method: InputMethod): string {
  if (method === '3d_upload') return '.glb,.gltf,.fbx,.obj';
  if (method === 'phone_scan') return '.jpg,.jpeg,.png,.mp4,.mov';
  if (method === 'photo_set' || method === 'selfie_pack') return '.jpg,.jpeg,.png';
  if (method === 'video_capture') return '.mp4,.mov';
  return '';
}

export function UploadPanel({
  method,
  files,
  textPrompt,
  onTextPromptChange,
  onFilesAdded,
  onRemoveFile,
}: UploadPanelProps) {
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onFilesAdded(event.target.files);
    }
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files) {
      onFilesAdded(event.dataTransfer.files);
    }
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div className="space-y-5">
      {method !== 'text_to_avatar' && (
        <>
          <label htmlFor="avatar-file-input" className="sr-only">
            Upload avatar input files
          </label>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            className="rounded-xl border border-dashed border-cyan-400/40 bg-cyan-500/5 p-6 text-center"
          >
            <p className="text-sm text-slate-200">ფაილები გადაათრიე აქ ან აირჩიე კომპიუტერიდან</p>
            <p className="mt-1 text-xs text-slate-400">მეთოდის წესები ავტომატურად შემოწმდება</p>
            <input
              id="avatar-file-input"
              type="file"
              multiple
              accept={getAccept(method)}
              onChange={onFileChange}
              className="mt-4 block w-full cursor-pointer rounded-lg border border-white/10 bg-white/5 p-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-cyan-200">ფაილების სია</h3>
            {files.length === 0 ? (
              <p className="text-sm text-slate-400">ფაილები ჯერ არ არის დამატებული.</p>
            ) : (
              <ul className="space-y-2">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                    <span className="truncate pr-3">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveFile(index)}
                      className="rounded-md border border-red-400/50 px-2 py-1 text-xs text-red-200 hover:bg-red-500/10"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {method === 'text_to_avatar' && (
        <div>
          <label htmlFor="avatar-text-prompt" className="mb-2 block text-sm font-semibold text-cyan-200">
            ტექსტური აღწერა (სავალდებულო)
          </label>
          <Textarea
            id="avatar-text-prompt"
            value={textPrompt}
            onChange={(event) => onTextPromptChange(event.target.value)}
            placeholder="მაგ: რეალისტური ბიზნეს ავატარი, ნეიტრალური ფონი, ბუნებრივი გამომეტყველება"
            rows={5}
          />
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="text-sm font-semibold text-cyan-200">რჩევები</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          {TIPS[method].map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
