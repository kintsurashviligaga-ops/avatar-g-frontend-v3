'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/textarea';
import { createBrowserClient } from '@/lib/supabase/browser';
import { Stepper } from './_components/Stepper';
import { GoalStep } from './_components/GoalStep';
import { TypeStep } from './_components/TypeStep';
import { MethodStep } from './_components/MethodStep';
import { UploadPanel } from './_components/UploadPanel';
import { OutputOptions } from './_components/OutputOptions';
import { GenerateStep } from './_components/GenerateStep';
import { ResultStep } from './_components/ResultStep';
import type { AvatarBuilderDraft, InputMethod } from './_components/types';
import { OrbitSolarSystem } from '@/components/OrbitSolarSystem';

const DRAFT_KEY = 'avatar_builder_wizard_draft_v1';

const STEP_TITLES = [
  'Goal',
  'Avatar Type',
  'Input Method',
  'Upload Inputs',
  'Output Options',
  'Generate',
  'Result',
];

const DEFAULT_DRAFT: AvatarBuilderDraft = {
  avatar_goal: 'personal',
  avatar_type: 'scan',
  input_method: 'photo_set',
  notes: '',
  text_prompt: '',
  output_options: {
    fullBody: true,
    background: 'transparent',
    rigging: false,
  },
};

const MB = 1024 * 1024;

function extOf(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  if (index < 0) return '';
  return fileName.slice(index).toLowerCase();
}

function validateFilesByMethod(method: InputMethod, files: File[], textPrompt: string): string | null {
  const imageExtensions = new Set(['.jpg', '.jpeg', '.png']);
  const videoExtensions = new Set(['.mp4', '.mov']);

  if (method === 'text_to_avatar') {
    if (!textPrompt.trim()) {
      return 'Text to Avatar მეთოდისთვის ტექსტური აღწერა სავალდებულოა.';
    }
    return null;
  }

  if (method === '3d_upload') {
    if (files.length !== 1) return '3D Upload საჭიროებს ზუსტად 1 ფაილს.';
    const firstFile = files[0];
    if (!firstFile) return '3D Upload საჭიროებს ზუსტად 1 ფაილს.';
    const extension = extOf(firstFile.name);
    if (!['.glb', '.gltf', '.fbx', '.obj'].includes(extension)) {
      return '3D Upload იღებს მხოლოდ .glb/.gltf/.fbx/.obj ფორმატს.';
    }
    if (firstFile.size > 200 * MB) {
      return '3D Upload ფაილი არ უნდა აღემატებოდეს 200MB-ს.';
    }
    return null;
  }

  if (method === 'phone_scan') {
    if (files.length === 0) return 'Phone Scan-ს ფაილები სჭირდება.';
    const allImages = files.every((file) => imageExtensions.has(extOf(file.name)));
    const allVideos = files.every((file) => videoExtensions.has(extOf(file.name)));
    const validPhotoMode = allImages && files.length >= 20 && files.length <= 80;
    const validVideoMode = allVideos && files.length >= 1 && files.length <= 3;

    if (!validPhotoMode && !validVideoMode) {
      return 'Phone Scan წესია: ან 1-3 ვიდეო (.mp4/.mov), ან 20-80 ფოტო (.jpg/.png).';
    }
    return null;
  }

  if (method === 'photo_set') {
    const allImages = files.every((file) => imageExtensions.has(extOf(file.name)));
    if (!allImages || files.length < 12 || files.length > 30) {
      return 'Photo Set მოთხოვნაა 12-30 ფოტო (.jpg/.png).';
    }
    return null;
  }

  if (method === 'video_capture') {
    if (files.length !== 1) return 'Video Capture საჭიროებს ზუსტად 1 ვიდეოს.';
    const firstFile = files[0];
    if (!firstFile) return 'Video Capture საჭიროებს ზუსტად 1 ვიდეოს.';
    if (!videoExtensions.has(extOf(firstFile.name))) {
      return 'Video Capture იღებს მხოლოდ .mp4/.mov ფორმატს.';
    }
    return null;
  }

  if (method === 'selfie_pack') {
    const allImages = files.every((file) => imageExtensions.has(extOf(file.name)));
    if (!allImages || files.length < 6 || files.length > 12) {
      return 'Selfie Pack მოთხოვნაა 6-12 სელფი (.jpg/.png).';
    }
  }

  return null;
}

function normalizeFiles(input: FileList | File[]): File[] {
  return Array.from(input);
}

export default function AvatarBuilderWizardPage() {
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale ?? 'ka';

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<AvatarBuilderDraft>(DEFAULT_DRAFT);
  const [files, setFiles] = useState<File[]>([]);
  const [ariaError, setAriaError] = useState<string>('');
  const [assetId, setAssetId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmittingCore, setIsSubmittingCore] = useState(false);
  const [resultStatus, setResultStatus] = useState<'processing' | 'ready'>('processing');
  const [resultModelUrl, setResultModelUrl] = useState<string | null>(null);
  const [resultPosterUrl, setResultPosterUrl] = useState<string | null>(null);
  const [processingText, setProcessingText] = useState('Processing started.');

  const supabase = useMemo(() => createBrowserClient(), []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AvatarBuilderDraft;
        setDraft(parsed);
      }
    } catch {
      setDraft(DEFAULT_DRAFT);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      return;
    }
  }, [draft]);

  const validateStep = (targetStep: number): boolean => {
    if (targetStep <= step) return true;

    if (step === 3) {
      const fileValidationError = validateFilesByMethod(draft.input_method, files, draft.text_prompt);
      if (fileValidationError) {
        setAriaError(fileValidationError);
        return false;
      }
    }

    return true;
  };

  const onStepChange = (nextStep: number) => {
    if (!validateStep(nextStep)) {
      return;
    }
    setAriaError('');
    setStep(nextStep);
  };

  const onAddFiles = (incoming: FileList | File[]) => {
    const addedFiles = normalizeFiles(incoming);
    const merged = [...files, ...addedFiles];
    const validationError = validateFilesByMethod(draft.input_method, merged, draft.text_prompt);

    if (validationError) {
      setAriaError(validationError);
      return;
    }

    setAriaError('');
    setFiles(merged);
  };

  const onRemoveFile = (index: number) => {
    setFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index));
  };

  const uploadInputs = async (userId: string, avatarAssetId: string): Promise<string[]> => {
    const uploadedUrls: string[] = [];

    for (const file of files) {
      const filePath = `${userId}/${avatarAssetId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      const uploadResult = await supabase.storage.from('avatars-input').upload(filePath, file, { upsert: false });

      if (uploadResult.error) {
        throw new Error(uploadResult.error.message);
      }

      const publicUrlResult = supabase.storage.from('avatars-input').getPublicUrl(filePath);
      uploadedUrls.push(publicUrlResult.data.publicUrl);
    }

    return uploadedUrls;
  };

  const onGenerate = async () => {
    const fileValidationError = validateFilesByMethod(draft.input_method, files, draft.text_prompt);
    if (fileValidationError) {
      setAriaError(fileValidationError);
      return;
    }

    setIsGenerating(true);
    setAriaError('');

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('აუთენტიკაცია საჭიროა გენერაციისთვის.');
      }

      const createResponse = await fetch('/api/avatar/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_goal: draft.avatar_goal,
          avatar_type: draft.avatar_type,
          input_method: draft.input_method,
          notes: draft.notes || undefined,
          text_prompt: draft.text_prompt || undefined,
          output_options: draft.output_options,
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Avatar create failed');
      }

      const createPayload = (await createResponse.json()) as {
        avatarAssetId: string;
      };

      const avatarAssetId = createPayload.avatarAssetId;
      setAssetId(avatarAssetId);
      setResultPosterUrl('/brand/logo.png');
      setResultModelUrl(null);
      setResultStatus('processing');
      setProcessingText('Input uploading and processing...');

      const uploadedUrls = draft.input_method === 'text_to_avatar' ? [] : await uploadInputs(user.id, avatarAssetId);

      const uploadCompleteResponse = await fetch('/api/avatar/upload-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarAssetId,
          input_urls: uploadedUrls,
        }),
      });

      if (!uploadCompleteResponse.ok) {
        throw new Error('Upload completion failed');
      }

      setStep(6);
      setProcessingText('Avatar is processing. You can use Simulate Ready in development.');
    } catch (error) {
      setAriaError(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const onSimulateReady = async () => {
    if (!assetId) {
      setAriaError('სიმულაციისთვის საჭიროა avatarAssetId.');
      return;
    }

    try {
      const origin = window.location.origin;
      const simulatedModelUrl = `${origin}/placeholders/avatar-sample.glb`;
      const simulatedPosterUrl = `${origin}/placeholders/avatar-poster.svg`;

      const response = await fetch('/api/avatar/mark-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarAssetId: assetId,
          model_glb_url: simulatedModelUrl,
          poster_url: simulatedPosterUrl,
          meta: { simulated: true },
        }),
      });

      if (!response.ok) {
        throw new Error('Simulate ready failed');
      }

      setResultModelUrl(simulatedModelUrl);
      setResultPosterUrl(simulatedPosterUrl);
      setResultStatus('ready');
      setProcessingText('Simulation completed.');
    } catch (error) {
      setAriaError(error instanceof Error ? error.message : 'Simulate ready failed');
    }
  };

  const onUseAsCoreAvatar = async () => {
    if (!assetId) {
      setAriaError('ჯერ გენერაცია დასრულებული არ არის.');
      return;
    }

    setIsSubmittingCore(true);
    setAriaError('');

    try {
      const response = await fetch('/api/avatar/set-core', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarAssetId: assetId }),
      });

      if (!response.ok) {
        throw new Error('Failed to set core avatar');
      }

      setProcessingText('Core avatar updated successfully.');
    } catch (error) {
      setAriaError(error instanceof Error ? error.message : 'Failed to set core avatar');
    } finally {
      setIsSubmittingCore(false);
    }
  };

  const onCreateAnother = () => {
    setStep(0);
    setFiles([]);
    setAssetId(null);
    setResultStatus('processing');
    setResultModelUrl(null);
    setResultPosterUrl(null);
    setProcessingText('');
    setAriaError('');
  };

  const onNext = () => {
    const nextStep = Math.min(step + 1, STEP_TITLES.length - 1);
    onStepChange(nextStep);
  };

  const onPrevious = () => {
    setStep((previous) => Math.max(previous - 1, 0));
  };

  return (
    <div className="min-h-screen bg-[#05070A] px-4 py-24 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Avatar Builder Wizard</h1>
          <p className="mt-2 text-slate-300">Wave 2 UI — persistence + upload simulation flow</p>
        </div>

        <OrbitSolarSystem />

        <Stepper
          steps={STEP_TITLES}
          currentStep={step}
          onStepChange={(nextStep) => {
            if (nextStep <= step || validateStep(nextStep)) {
              setStep(nextStep);
            }
          }}
        />

        <div aria-live="polite" className="min-h-[24px] text-sm text-red-300">
          {ariaError}
        </div>

        <Card id={`step-panel-${step}`} aria-labelledby={`step-tab-${step}`} role="tabpanel" className="border border-white/10 bg-white/5 p-5">
          {step === 0 && (
            <GoalStep
              value={draft.avatar_goal}
              onChange={(avatarGoal) => setDraft((previous) => ({ ...previous, avatar_goal: avatarGoal }))}
            />
          )}

          {step === 1 && (
            <TypeStep
              value={draft.avatar_type}
              onChange={(avatarType) => setDraft((previous) => ({ ...previous, avatar_type: avatarType }))}
            />
          )}

          {step === 2 && (
            <MethodStep
              value={draft.input_method}
              onChange={(inputMethod) => {
                setDraft((previous) => ({ ...previous, input_method: inputMethod }));
                setFiles([]);
                setAriaError('');
              }}
            />
          )}

          {step === 3 && (
            <div className="space-y-4">
              <UploadPanel
                method={draft.input_method}
                files={files}
                textPrompt={draft.text_prompt}
                onTextPromptChange={(textPrompt) => setDraft((previous) => ({ ...previous, text_prompt: textPrompt }))}
                onFilesAdded={onAddFiles}
                onRemoveFile={onRemoveFile}
              />
              <div>
                <label htmlFor="avatar-notes" className="mb-2 block text-sm font-semibold text-cyan-200">
                  დამატებითი შენიშვნა (optional)
                </label>
                <Textarea
                  id="avatar-notes"
                  value={draft.notes}
                  onChange={(event) => setDraft((previous) => ({ ...previous, notes: event.target.value }))}
                  rows={3}
                  placeholder="დეტალები პოზის, ემოციის ან ბრენდის ტონის შესახებ"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <OutputOptions
              value={draft.output_options}
              onChange={(outputOptions) => setDraft((previous) => ({ ...previous, output_options: outputOptions }))}
            />
          )}

          {step === 5 && (
            <GenerateStep draft={draft} fileCount={files.length} isGenerating={isGenerating} onGenerate={onGenerate} />
          )}

          {step === 6 && (
            <ResultStep
              locale={locale}
              modelUrl={resultModelUrl}
              posterUrl={resultPosterUrl}
              status={resultStatus}
              isDev={process.env.NODE_ENV === 'development'}
              onSimulateReady={onSimulateReady}
              onSetCore={onUseAsCoreAvatar}
              onCreateAnother={onCreateAnother}
              processingText={isSubmittingCore ? 'Updating core avatar...' : processingText}
            />
          )}
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={onPrevious} disabled={step === 0 || isGenerating}>
            Previous
          </Button>

          {step < 5 && (
            <Button type="button" variant="primary" onClick={onNext}>
              Next
            </Button>
          )}

          {step === 6 && (
            <Button type="button" variant="secondary" onClick={onCreateAnother}>
              Reset Wizard
            </Button>
          )}

          <Input
            readOnly
            value={assetId ?? 'avatarAssetId: -'}
            aria-label="avatar asset id"
            className="max-w-xs bg-black/30"
          />
        </div>
      </div>
    </div>
  );
}
