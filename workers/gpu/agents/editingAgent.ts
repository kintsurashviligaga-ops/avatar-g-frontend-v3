/**
 * Editing Agent — GPU Worker
 * CapCut-level editing pipeline: trim, transitions, subtitles, lip sync,
 * color grading, audio mixing, watermark, multi-format export.
 *
 * Agent ID: editing-agent
 * Worker type: GPU
 * Timeout: 1200s
 */

import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'

import { transcribeAudioBuffer } from '../../../lib/agent-g/voice/stt'
import { createPrediction, pollUntilDone } from '../../../lib/replicate/client'
import { structuredLog } from '../../shared/logger'
import { supabase } from '../../shared/supabaseClient'
import type { AgentResult, ArtifactReference } from '../../shared/types'
import type { EditingJobPayload, EditingJobResult } from '../../../types/jobs'

interface SourceAssetCache {
  bucket: string
  path: string
  bytes: Buffer
  mimeType: string
  localPath: string
  durationSec?: number
  width?: number
  height?: number
  codec?: string
}

interface MediaProbe {
  durationSec: number
  width: number
  height: number
  codec: string
  hasAudio: boolean
}

interface ToolchainState {
  ffmpeg: boolean
  ffprobe: boolean
}

interface SubtitleSegment {
  startSec: number
  endSec: number
  text: string
}

export interface EditingProgress {
  status: 'queued' | 'processing' | 'completed' | 'failed'
  currentStepId: string | null
  currentStepDescription: string | null
  currentStepIndex: number
  totalSteps: number
  stepsCompleted: string[]
  percent: number
  notes: string[]
  updatedAt: string
}

interface EditingAgentOptions {
  onProgress?: (progress: EditingProgress) => Promise<void> | void
}

// ── Pipeline Step Definition ────────────────────────────
interface EditingStep {
  id: string
  description: string
  fn: (ctx: EditingContext) => Promise<void>
  gpuRequired?: boolean
}

interface EditingContext {
  jobId: string
  userId: string
  payload: EditingJobPayload
  workDir: string
  artifacts: ArtifactReference[]
  timeline: unknown
  metadata: Record<string, unknown>
}

const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
]

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function getSourceFiles(ctx: EditingContext): SourceAssetCache[] {
  return (ctx.metadata.sourceFiles as SourceAssetCache[] | undefined) ?? []
}

function getProcessingNotes(ctx: EditingContext): string[] {
  if (!Array.isArray(ctx.metadata.processingNotes)) {
    ctx.metadata.processingNotes = []
  }

  return ctx.metadata.processingNotes as string[]
}

function addProcessingNote(ctx: EditingContext, note: string): void {
  getProcessingNotes(ctx).push(note)
  structuredLog('warn', 'editing_note', { jobId: ctx.jobId, note })
}

function hasOpenAIKey(): boolean {
  return Boolean(String(process.env.OPENAI_API_KEY || '').trim())
}

function getLipSyncModelId(): string {
  return String(process.env.REPLICATE_LIP_SYNC_MODEL || 'cjwbw/wav2lip').trim()
}

function getLipSyncInputFields(): { faceField: string; audioField: string } {
  return {
    faceField: String(process.env.REPLICATE_LIP_SYNC_FACE_FIELD || 'face').trim() || 'face',
    audioField: String(process.env.REPLICATE_LIP_SYNC_AUDIO_FIELD || 'audio').trim() || 'audio',
  }
}

function getCurrentMediaPath(ctx: EditingContext): string | null {
  return typeof ctx.metadata.currentMediaPath === 'string' ? ctx.metadata.currentMediaPath : null
}

function setCurrentMediaPath(ctx: EditingContext, mediaPath: string, probe?: MediaProbe | null): void {
  ctx.metadata.currentMediaPath = mediaPath
  if (probe) {
    ctx.metadata.currentProbe = probe
  }
}

function getCurrentProbe(ctx: EditingContext): MediaProbe | null {
  const probe = ctx.metadata.currentProbe
  return probe && typeof probe === 'object' ? probe as MediaProbe : null
}

function nextWorkPath(ctx: EditingContext, label: string, extension: string): string {
  const currentIndex = typeof ctx.metadata.fileCounter === 'number'
    ? (ctx.metadata.fileCounter as number) + 1
    : 1

  ctx.metadata.fileCounter = currentIndex
  return join(ctx.workDir, `${String(currentIndex).padStart(2, '0')}-${label}.${extension}`)
}

function inferExtension(assetPath: string, mimeType: string): string {
  const fileExtension = extname(assetPath).replace('.', '').trim().toLowerCase()
  if (fileExtension) {
    return fileExtension
  }

  if (mimeType.includes('quicktime')) return 'mov'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('matroska')) return 'mkv'
  if (mimeType.includes('gif')) return 'gif'
  return 'mp4'
}

function getInstructionText(ctx: EditingContext): string {
  const payloadMeta = ctx.payload as unknown as Record<string, unknown>
  const directInstruction = typeof payloadMeta.instructions === 'string'
    ? String(payloadMeta.instructions).trim()
    : ''

  if (directInstruction) {
    return directInstruction
  }

  for (const operation of ctx.payload.operations) {
    const candidate = asRecord(operation).instructions
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return ''
}

function getEffectPreset(ctx: EditingContext): string {
  const payloadMeta = ctx.payload as unknown as Record<string, unknown>
  const directEffect = typeof payloadMeta.effect === 'string'
    ? String(payloadMeta.effect).trim()
    : ''

  if (directEffect) {
    return directEffect
  }

  const operation = ctx.payload.operations.find((item) => item.op === 'color_grade')
  const preset = asRecord(operation).preset
  return typeof preset === 'string' ? preset : 'none'
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const numeric = Number.parseFloat(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }
  }

  return null
}

function parseClockValue(raw: string): number | null {
  const value = raw.trim()
  if (!value) {
    return null
  }

  if (/^\d+(?:\.\d+)?$/.test(value)) {
    return Number.parseFloat(value)
  }

  const parts = value.split(':').map((part) => Number.parseFloat(part))
  if (parts.some((part) => Number.isNaN(part))) {
    return null
  }

  if (parts.length === 3) {
      const [hours, minutes, seconds] = parts as [number, number, number]
      return (hours * 3600) + (minutes * 60) + seconds
  }

  if (parts.length === 2) {
      const [minutes, seconds] = parts as [number, number]
      return (minutes * 60) + seconds
  }

  return null
}

function parseDurationPhrase(amount: string, unit: string): number {
  const numeric = Number.parseFloat(amount)
  if (!Number.isFinite(numeric)) {
    return 0
  }

  return /^m/i.test(unit) ? numeric * 60 : numeric
}

function resolveTrimWindow(
  operation: Record<string, unknown>,
  instructionText: string,
  durationSec?: number
): { start: number; end?: number } | null {
  const explicitStart = parseNumber(operation.start_sec ?? operation.start ?? operation.from)
  const explicitEnd = parseNumber(operation.end_sec ?? operation.end ?? operation.to)

  if (explicitStart !== null || explicitEnd !== null) {
    const start = Math.max(0, explicitStart ?? 0)
    const end = explicitEnd !== null ? Math.max(start, explicitEnd) : undefined
    return end !== undefined && end === start ? null : { start, end }
  }

  const fromToMatch = instructionText.match(/from\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s+(?:to|until|through|-)\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)/i)
  if (fromToMatch) {
      const [, startToken, endToken] = fromToMatch
      const start = startToken ? parseClockValue(startToken) : null
      const end = endToken ? parseClockValue(endToken) : null
    if (start !== null && end !== null && end > start) {
      return { start, end }
    }
  }

  const keepFirstMatch = instructionText.match(/(?:keep|trim(?:\s+to)?)\s+first\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)/i)
  if (keepFirstMatch) {
      const [, amount, unit] = keepFirstMatch
      if (amount && unit) {
        return { start: 0, end: parseDurationPhrase(amount, unit) }
      }
  }

  const keepLastMatch = instructionText.match(/(?:keep|trim(?:\s+to)?)\s+last\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)/i)
  if (keepLastMatch && durationSec) {
      const [, amountToken, unitToken] = keepLastMatch
      if (amountToken && unitToken) {
        const amount = parseDurationPhrase(amountToken, unitToken)
        return { start: Math.max(0, durationSec - amount), end: durationSec }
      }
  }

  const removeFirstMatch = instructionText.match(/remove\s+first\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)/i)
  if (removeFirstMatch) {
      const [, amount, unit] = removeFirstMatch
      if (amount && unit) {
        return { start: parseDurationPhrase(amount, unit), end: durationSec }
      }
  }

  return null
}

function wrapCaptionText(value: string, maxLineLength = 42): string {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word
    if (nextLine.length > maxLineLength && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = nextLine
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines.slice(0, 3).join('\n')
}

function formatSrtTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds)
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const seconds = Math.floor(clamped % 60)
  const milliseconds = Math.floor((clamped - Math.floor(clamped)) * 1000)

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`
}

function buildSrtContent(segments: SubtitleSegment[]): string {
  return segments
    .map((segment, index) => `${index + 1}\n${formatSrtTimestamp(segment.startSec)} --> ${formatSrtTimestamp(segment.endSec)}\n${segment.text.trim()}\n`)
    .join('\n')
}

function buildHeuristicSubtitleSegments(transcript: string, durationSec: number): SubtitleSegment[] {
  const cleanTranscript = transcript.replace(/\s+/g, ' ').trim()
  if (!cleanTranscript) {
    return []
  }

  const chunks = cleanTranscript
    .split(/(?<=[.!?])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  const normalizedChunks = (chunks.length > 0 ? chunks : wrapCaptionText(cleanTranscript, 36).split('\n'))
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  const targetDuration = Math.max(durationSec, normalizedChunks.length * 2.2)
  const segmentDuration = targetDuration / Math.max(normalizedChunks.length, 1)

  return normalizedChunks.map((text, index) => {
    const startSec = index * segmentDuration
    const endSec = Math.min(targetDuration, startSec + segmentDuration)

    return {
      startSec,
      endSec: Math.max(startSec + 1.4, endSec),
      text,
    }
  })
}

function escapeFilterPath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
}

function normalizeReplicateOutputUrl(output: unknown): string | null {
  if (typeof output === 'string' && output.trim()) {
    return output.trim()
  }

  if (Array.isArray(output)) {
    for (const item of output) {
      const nested = normalizeReplicateOutputUrl(item)
      if (nested) {
        return nested
      }
    }
    return null
  }

  if (output && typeof output === 'object') {
    const candidate = output as Record<string, unknown>
    for (const key of ['url', 'video', 'output', 'file']) {
      const nested = normalizeReplicateOutputUrl(candidate[key])
      if (nested) {
        return nested
      }
    }
  }

  return null
}

function parseExportFormat(format: string): {
  extension: string
  mimeType: string
  height?: number
  codec: string
} {
  const lowered = format.toLowerCase()
  const heightMatch = lowered.match(/(\d{3,4})p/)
    const height = heightMatch?.[1] ? Number.parseInt(heightMatch[1], 10) : undefined

  if (lowered.startsWith('webm')) {
    return { extension: 'webm', mimeType: 'video/webm', height, codec: 'vp9' }
  }

  if (lowered.startsWith('gif')) {
    return { extension: 'gif', mimeType: 'image/gif', height, codec: 'gif' }
  }

  return { extension: 'mp4', mimeType: 'video/mp4', height, codec: 'h264' }
}

async function runProcess(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(new Error(`${command} exited with code ${code}: ${(stderr || stdout).trim()}`))
    })
  })
}

async function commandAvailable(command: string): Promise<boolean> {
  try {
    await runProcess(command, ['-version'])
    return true
  } catch {
    return false
  }
}

async function getToolchain(ctx: EditingContext): Promise<ToolchainState> {
  const cached = ctx.metadata.toolchain
  if (cached && typeof cached === 'object') {
    return cached as ToolchainState
  }

  const toolchain = {
    ffmpeg: await commandAvailable('ffmpeg'),
    ffprobe: await commandAvailable('ffprobe'),
  }

  ctx.metadata.toolchain = toolchain
  if (!toolchain.ffmpeg) {
    addProcessingNote(ctx, 'ffmpeg is unavailable; editing falls back to source-preserving export')
  }
  if (!toolchain.ffprobe) {
    addProcessingNote(ctx, 'ffprobe is unavailable; output metadata uses conservative defaults')
  }

  return toolchain
}

async function probeMedia(ctx: EditingContext, mediaPath: string): Promise<MediaProbe | null> {
  const toolchain = await getToolchain(ctx)
  if (!toolchain.ffprobe) {
    return null
  }

  try {
    const { stdout } = await runProcess('ffprobe', [
      '-v', 'error',
      '-show_streams',
      '-show_format',
      '-of', 'json',
      mediaPath,
    ])
    const parsed = JSON.parse(stdout) as {
      streams?: Array<Record<string, unknown>>
      format?: Record<string, unknown>
    }
    const streams = Array.isArray(parsed.streams) ? parsed.streams : []
    const videoStream = streams.find((stream) => stream.codec_type === 'video')
    const audioStream = streams.find((stream) => stream.codec_type === 'audio')
    const formatDuration = parseNumber(parsed.format?.duration)
    const streamDuration = parseNumber(videoStream?.duration)

    return {
      durationSec: formatDuration ?? streamDuration ?? 0,
      width: Number(videoStream?.width ?? 0),
      height: Number(videoStream?.height ?? 0),
      codec: typeof videoStream?.codec_name === 'string' ? videoStream.codec_name : 'unknown',
      hasAudio: Boolean(audioStream),
    }
  } catch (error) {
    addProcessingNote(ctx, error instanceof Error
      ? `ffprobe failed for ${mediaPath}: ${error.message}`
      : `ffprobe failed for ${mediaPath}`)
    return null
  }
}

async function renderCurrentMedia(
  ctx: EditingContext,
  label: string,
  videoFilters: string[],
  audioFilters: string[] = []
): Promise<void> {
  if (videoFilters.length === 0 && audioFilters.length === 0) {
    return
  }

  const currentMediaPath = getCurrentMediaPath(ctx)
  if (!currentMediaPath) {
    throw new Error('No active media file is available for rendering')
  }

  const outputPath = nextWorkPath(ctx, label, 'mp4')
  const args = ['-y', '-i', currentMediaPath, '-map', '0:v:0', '-map', '0:a?']

  if (videoFilters.length > 0) {
    args.push('-vf', videoFilters.join(','))
  }
  if (audioFilters.length > 0) {
    args.push('-af', audioFilters.join(','))
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    outputPath,
  )

  await runProcess('ffmpeg', args)
  const probe = await probeMedia(ctx, outputPath)
  setCurrentMediaPath(ctx, outputPath, probe)
}

async function findFontFile(): Promise<string | null> {
  for (const candidate of FONT_CANDIDATES) {
    try {
      await access(candidate)
      return candidate
    } catch {
      continue
    }
  }

  return null
}

async function uploadWorkingFile(
  ctx: EditingContext,
  localPath: string,
  storageName: string,
  mimeType: string,
): Promise<string> {
  const bytes = await readFile(localPath)
  const storagePath = `${ctx.payload.output_path_prefix}/working/${storageName}`
  const { error: uploadError } = await supabase.storage
    .from('job-artifacts')
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: true,
    })

  if (uploadError) {
    throw new Error(`Failed to upload working asset ${storageName}: ${uploadError.message}`)
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from('job-artifacts')
    .createSignedUrl(storagePath, 60 * 60)

  if (signedUrlError || !data?.signedUrl) {
    throw new Error(`Failed to sign working asset ${storageName}`)
  }

  return data.signedUrl
}

async function downloadRemoteBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to download remote asset: ${response.status}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

async function extractAudioTrack(
  ctx: EditingContext,
  label: string,
  codec: 'aac' | 'pcm_s16le' = 'aac',
): Promise<{ localPath: string; mimeType: string } | null> {
  const toolchain = await getToolchain(ctx)
  const currentMediaPath = getCurrentMediaPath(ctx)
  const currentProbe = getCurrentProbe(ctx)

  if (!toolchain.ffmpeg || !currentMediaPath || !currentProbe?.hasAudio) {
    return null
  }

  const extension = codec === 'pcm_s16le' ? 'wav' : 'm4a'
  const mimeType = codec === 'pcm_s16le' ? 'audio/wav' : 'audio/mp4'
  const outputPath = nextWorkPath(ctx, label, extension)
  const args = [
    '-y',
    '-i', currentMediaPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
  ]

  if (codec === 'pcm_s16le') {
    args.push('-c:a', 'pcm_s16le')
  } else {
    args.push('-c:a', 'aac', '-b:a', '128k')
  }

  args.push(outputPath)
  await runProcess('ffmpeg', args)

  return {
    localPath: outputPath,
    mimeType,
  }
}

async function extractPosterFrame(ctx: EditingContext): Promise<string | null> {
  const toolchain = await getToolchain(ctx)
  const currentMediaPath = getCurrentMediaPath(ctx)

  if (!toolchain.ffmpeg || !currentMediaPath) {
    return null
  }

  const framePath = nextWorkPath(ctx, 'lip-sync-face', 'png')
  await runProcess('ffmpeg', [
    '-y',
    '-ss', '0',
    '-i', currentMediaPath,
    '-frames:v', '1',
    framePath,
  ])

  return framePath
}

async function applyInstructionOverlaySubtitles(
  ctx: EditingContext,
  instructionText: string,
  mode: string,
): Promise<void> {
  const currentProbe = getCurrentProbe(ctx)
  const displayDuration = Math.min(Math.max(currentProbe?.durationSec ?? 6, 3), 8)
  const captionText = wrapCaptionText(instructionText)
  const textFilePath = join(ctx.workDir, 'captions.txt')
  await writeFile(textFilePath, captionText)

  const fontFile = await findFontFile()
  const drawTextParts = [
    fontFile ? `fontfile='${escapeFilterPath(fontFile)}'` : null,
    `textfile='${escapeFilterPath(textFilePath)}'`,
    'reload=0',
    'fontcolor=white',
    'fontsize=34',
    'line_spacing=8',
    'x=(w-text_w)/2',
    'y=h-text_h-96',
    'box=1',
    'boxcolor=black@0.45',
    'boxborderw=20',
    `enable='between(t\\,0\\,${displayDuration.toFixed(3)})'`,
  ].filter(Boolean)

  await renderCurrentMedia(ctx, 'subtitles', [`drawtext=${drawTextParts.join(':')}`])
  ctx.metadata.subtitleMode = mode
  ctx.metadata.subtitleText = captionText
}

async function burnSrtSubtitles(
  ctx: EditingContext,
  transcript: string,
  segments: SubtitleSegment[],
): Promise<void> {
  const srtPath = join(ctx.workDir, 'captions.srt')
  await writeFile(srtPath, buildSrtContent(segments))

  const subtitleFilter = [
    `subtitles='${escapeFilterPath(srtPath)}'`,
    "force_style='FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF&,OutlineColour=&H80000000&,BorderStyle=3,Outline=1,Shadow=0,MarginV=48'",
  ].join(':')

  await renderCurrentMedia(ctx, 'subtitles', [subtitleFilter])
  ctx.metadata.subtitleMode = 'openai-stt'
  ctx.metadata.subtitleTranscript = transcript
  ctx.metadata.subtitleSegmentCount = segments.length
}

function buildProgressSnapshot(
  status: EditingProgress['status'],
  currentStepId: string | null,
  currentStepDescription: string | null,
  currentStepIndex: number,
  totalSteps: number,
  stepsCompleted: string[],
  notes: string[],
): EditingProgress {
  const percent = status === 'completed'
    ? 100
    : Math.min(99, Math.max(0, Math.round((stepsCompleted.length / Math.max(totalSteps, 1)) * 100)))

  return {
    status,
    currentStepId,
    currentStepDescription,
    currentStepIndex,
    totalSteps,
    stepsCompleted,
    percent,
    notes,
    updatedAt: new Date().toISOString(),
  }
}

async function emitProgress(
  ctx: EditingContext,
  options: EditingAgentOptions | undefined,
  progress: EditingProgress,
): Promise<void> {
  ctx.metadata.progress = progress
  if (options?.onProgress) {
    await options.onProgress(progress)
  }
}

// ── Step Implementations ────────────────────────────────
async function assembleScenes(ctx: EditingContext): Promise<void> {
  structuredLog('info', 'step_scene_assembly', { jobId: ctx.jobId, assets: ctx.payload.source_assets.length })
  await mkdir(ctx.workDir, { recursive: true })
  await getToolchain(ctx)

  const sourceFiles: SourceAssetCache[] = []
  for (const [index, asset] of ctx.payload.source_assets.entries()) {
    const { data, error } = await supabase.storage
      .from(asset.bucket)
      .download(asset.path)
    if (error) throw new Error(`Failed to download ${asset.path}: ${error.message}`)

    const bytes = Buffer.from(await data.arrayBuffer())
    const extension = inferExtension(asset.path, data.type || 'video/mp4')
    const localPath = join(ctx.workDir, `source-${String(index + 1).padStart(2, '0')}.${extension}`)
    await writeFile(localPath, bytes)
    const probe = await probeMedia(ctx, localPath)

    sourceFiles.push({
      bucket: asset.bucket,
      path: asset.path,
      bytes,
      mimeType: data.type || 'video/mp4',
      localPath,
      durationSec: probe?.durationSec,
      width: probe?.width,
      height: probe?.height,
      codec: probe?.codec,
    })
    structuredLog('debug', 'asset_downloaded', { path: asset.path, size: bytes.byteLength })
  }

  if (sourceFiles.length === 0) {
    throw new Error('Editing job has no source assets')
  }

  ctx.metadata.sourceFiles = sourceFiles
  const primarySource = sourceFiles[0] as SourceAssetCache
  const primaryProbe = primarySource.durationSec !== undefined
    ? {
        durationSec: primarySource.durationSec,
        width: primarySource.width ?? 0,
        height: primarySource.height ?? 0,
        codec: primarySource.codec ?? 'unknown',
        hasAudio: true,
      }
    : await probeMedia(ctx, primarySource.localPath)

  setCurrentMediaPath(ctx, primarySource.localPath, primaryProbe)
}

async function applyTrimCuts(ctx: EditingContext): Promise<void> {
  const trimOps = ctx.payload.operations.filter((op) => op.op === 'trim')
  structuredLog('info', 'step_trim_cut', { jobId: ctx.jobId, trimCount: trimOps.length })
  if (trimOps.length === 0) return

  const toolchain = await getToolchain(ctx)
  if (!toolchain.ffmpeg) return

  const trimWindow = resolveTrimWindow(
    asRecord(trimOps[0]),
    getInstructionText(ctx),
    getCurrentProbe(ctx)?.durationSec,
  )

  if (!trimWindow) {
    addProcessingNote(ctx, 'No explicit trim markers were found in the editing instructions; trim step skipped')
    return
  }

  const currentMediaPath = getCurrentMediaPath(ctx)
  if (!currentMediaPath) {
    throw new Error('Trim step has no input media')
  }

  const outputPath = nextWorkPath(ctx, 'trim', 'mp4')
  const args = ['-y']
  if (trimWindow.start > 0) {
    args.push('-ss', trimWindow.start.toFixed(3))
  }
  args.push('-i', currentMediaPath)
  if (trimWindow.end !== undefined) {
    const duration = Math.max(0.1, trimWindow.end - trimWindow.start)
    args.push('-t', duration.toFixed(3))
  }
  args.push(
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    outputPath,
  )

  await runProcess('ffmpeg', args)
  const probe = await probeMedia(ctx, outputPath)
  setCurrentMediaPath(ctx, outputPath, probe)
  ctx.metadata.trimWindow = trimWindow
}

async function applyTransitions(ctx: EditingContext): Promise<void> {
  const transOps = ctx.payload.operations.filter((op) => op.op === 'transition')
  structuredLog('info', 'step_transitions', { jobId: ctx.jobId, transCount: transOps.length })
  if (transOps.length === 0) return

  const toolchain = await getToolchain(ctx)
  if (!toolchain.ffmpeg) return

  const transitionPreset = String(asRecord(transOps[0]).preset ?? 'cut').toLowerCase()
  if (transitionPreset === 'cut') {
    return
  }

  const currentProbe = getCurrentProbe(ctx)
  const durationSec = currentProbe?.durationSec ?? 0
  if (durationSec <= 1.2) {
    addProcessingNote(ctx, 'Transition fade skipped because the clip is too short')
    return
  }

  const fadeOutStart = Math.max(0, durationSec - 0.45)
  await renderCurrentMedia(
    ctx,
    'transition',
    [
      'fade=t=in:st=0:d=0.35',
      `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.45`,
    ],
    currentProbe?.hasAudio
      ? [
          'afade=t=in:st=0:d=0.25',
          `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.45`,
        ]
      : [],
  )
}

async function generateSubtitles(ctx: EditingContext): Promise<void> {
  const subOps = ctx.payload.operations.filter((op) => op.op === 'subtitle')
  if (subOps.length === 0) return
  structuredLog('info', 'step_subtitles', { jobId: ctx.jobId })

  const toolchain = await getToolchain(ctx)
  if (!toolchain.ffmpeg) return

  const instructionText = getInstructionText(ctx)
  const currentProbe = getCurrentProbe(ctx)

  if (currentProbe?.hasAudio && hasOpenAIKey()) {
    try {
      const extractedAudio = await extractAudioTrack(ctx, 'subtitle-audio', 'aac')
      if (extractedAudio) {
        const audioBuffer = await readFile(extractedAudio.localPath)
        const transcription = await transcribeAudioBuffer({
          audioBuffer,
          filename: 'editing-track.m4a',
          mimeType: extractedAudio.mimeType,
          withSegments: true,
        })

        const subtitleSegments = transcription.segments?.length
          ? transcription.segments
          : buildHeuristicSubtitleSegments(transcription.transcript, currentProbe.durationSec)

        if (subtitleSegments.length > 0) {
          await burnSrtSubtitles(ctx, transcription.transcript, subtitleSegments)
          return
        }
      }
    } catch (error) {
      addProcessingNote(
        ctx,
        error instanceof Error
          ? `OpenAI subtitle transcription failed: ${error.message}`
          : 'OpenAI subtitle transcription failed',
      )
    }
  }

  if (!instructionText) {
    addProcessingNote(ctx, 'Subtitle generation skipped because no transcription or instruction overlay text was available')
    return
  }

  await applyInstructionOverlaySubtitles(ctx, instructionText, 'instruction-overlay')
}

async function applyLipSync(ctx: EditingContext): Promise<void> {
  const lipOps = ctx.payload.operations.filter((op) => op.op === 'lip_sync')
  if (lipOps.length === 0) return
  structuredLog('info', 'step_lip_sync', { jobId: ctx.jobId, gpuRequired: true })
  ctx.metadata.lipSyncRequested = true
  ctx.metadata.lipSyncApplied = false

  const currentProbe = getCurrentProbe(ctx)
  if (!currentProbe?.hasAudio) {
    addProcessingNote(ctx, 'Lip sync skipped because the video has no audio track to drive mouth movement')
    return
  }

  try {
    const faceFramePath = await extractPosterFrame(ctx)
    const audioTrack = await extractAudioTrack(ctx, 'lip-sync-audio', 'pcm_s16le')
    if (!faceFramePath || !audioTrack) {
      addProcessingNote(ctx, 'Lip sync skipped because the worker could not extract a face frame or audio track')
      return
    }

    const faceUrl = await uploadWorkingFile(ctx, faceFramePath, 'lip-sync/face.png', 'image/png')
    const audioUrl = await uploadWorkingFile(ctx, audioTrack.localPath, 'lip-sync/audio.wav', audioTrack.mimeType)
    const { faceField, audioField } = getLipSyncInputFields()
    const modelId = getLipSyncModelId()

    const prediction = await createPrediction(modelId, {
      [faceField]: faceUrl,
      [audioField]: audioUrl,
    })
    const completed = await pollUntilDone(prediction.id, 120, 2500)
    if (completed.status !== 'succeeded') {
      throw new Error(completed.error || `Replicate lip sync ended with status ${completed.status}`)
    }

    const outputUrl = normalizeReplicateOutputUrl(completed.output)
    if (!outputUrl) {
      throw new Error('Replicate lip sync returned no video URL')
    }

    const syncedBytes = await downloadRemoteBuffer(outputUrl)
    const syncedPath = nextWorkPath(ctx, 'lip-sync', 'mp4')
    await writeFile(syncedPath, syncedBytes)

    const syncedProbe = await probeMedia(ctx, syncedPath)
    setCurrentMediaPath(ctx, syncedPath, syncedProbe)
    ctx.metadata.lipSyncApplied = true
    ctx.metadata.lipSyncModel = modelId
  } catch (error) {
    addProcessingNote(
      ctx,
      error instanceof Error
        ? `Lip sync fallback engaged: ${error.message}`
        : 'Lip sync fallback engaged',
    )
  }
}

async function applyColorGrade(ctx: EditingContext): Promise<void> {
  const colorOps = ctx.payload.operations.filter((op) => op.op === 'color_grade')
  if (colorOps.length === 0) return
  structuredLog('info', 'step_color_grade', { jobId: ctx.jobId })

  const toolchain = await getToolchain(ctx)
  if (!toolchain.ffmpeg) return

  const preset = getEffectPreset(ctx).toLowerCase()
  const videoFilters: string[] = []
  const audioFilters: string[] = []

  if (preset === 'cinematic') {
    videoFilters.push(
      'eq=contrast=1.08:brightness=-0.03:saturation=1.18',
      'unsharp=5:5:0.8:3:3:0.4',
      'vignette=PI/5',
    )
  } else if (preset === 'retro') {
    videoFilters.push(
      'eq=contrast=0.94:brightness=0.03:saturation=0.72',
      'colorchannelmixer=0.95:0.02:0.02:0:0.03:0.88:0.09:0:0.02:0.06:0.72:0',
      'noise=alls=4:allf=t',
    )
  } else if (preset === 'slowmo') {
    videoFilters.push('setpts=1.35*PTS')
    if (getCurrentProbe(ctx)?.hasAudio) {
      audioFilters.push('atempo=0.85', 'atempo=0.87')
    }
  }

  if (videoFilters.length === 0 && audioFilters.length === 0) {
    return
  }

  await renderCurrentMedia(ctx, `grade-${preset}`, videoFilters, audioFilters)
}

async function mixAudio(ctx: EditingContext): Promise<void> {
  const audioOps = ctx.payload.operations.filter((op) => op.op === 'audio_mix')
  if (audioOps.length === 0) return
  structuredLog('info', 'step_audio_mix', { jobId: ctx.jobId })

  const toolchain = await getToolchain(ctx)
  if (!toolchain.ffmpeg) return

  if (!getCurrentProbe(ctx)?.hasAudio) {
    addProcessingNote(ctx, 'Audio normalization skipped because the clip has no audio stream')
    return
  }

  const profile = String(asRecord(audioOps[0]).profile ?? 'balanced').toLowerCase()
  const audioFilter = profile === 'balanced'
    ? 'loudnorm=I=-16:TP=-1.5:LRA=11'
    : 'alimiter=limit=0.95'

  await renderCurrentMedia(ctx, 'audio-mix', [], [audioFilter])
}

async function applyWatermark(ctx: EditingContext): Promise<void> {
  const wmOps = ctx.payload.operations.filter((op) => op.op === 'watermark')
  if (wmOps.length === 0) return
  structuredLog('info', 'step_watermark', { jobId: ctx.jobId })

  const toolchain = await getToolchain(ctx)
  if (!toolchain.ffmpeg) return

  const watermarkText = String(asRecord(wmOps[0]).text ?? 'MyAvatar.ge')
  const fontFile = await findFontFile()
  const drawTextParts = [
    fontFile ? `fontfile='${escapeFilterPath(fontFile)}'` : null,
    `text='${watermarkText.replace(/'/g, "\\'")}'`,
    'fontcolor=white@0.55',
    'fontsize=24',
    'x=w-text_w-48',
    'y=h-text_h-48',
    'shadowcolor=black@0.5',
    'shadowx=2',
    'shadowy=2',
  ].filter(Boolean)

  await renderCurrentMedia(ctx, 'watermark', [`drawtext=${drawTextParts.join(':')}`])
}

async function exportFormats(ctx: EditingContext): Promise<void> {
  structuredLog('info', 'step_export', {
    jobId: ctx.jobId,
    formats: ctx.payload.export_formats,
    gpuRequired: true,
  })
  const sourceFiles = getSourceFiles(ctx)
  const primarySource = sourceFiles[0]
  const currentMediaPath = getCurrentMediaPath(ctx)
  if (!primarySource || !currentMediaPath) {
    throw new Error('No source asset available for export')
  }

  const toolchain = await getToolchain(ctx)
  const currentProbe = getCurrentProbe(ctx)

  for (const format of ctx.payload.export_formats) {
    const spec = parseExportFormat(format)
    let uploadBytes: Buffer
    let mimeType = spec.mimeType
    let localExportPath = currentMediaPath
    let exportProbe = currentProbe

    if (toolchain.ffmpeg) {
      localExportPath = nextWorkPath(ctx, `export-${format}`, spec.extension)
      const args = ['-y', '-i', currentMediaPath]

      if (spec.extension === 'gif') {
        const videoFilters = [`fps=10`]
        if (spec.height) {
          videoFilters.push(`scale=-2:${spec.height}:force_original_aspect_ratio=decrease`)
        }
        args.push('-vf', videoFilters.join(','), '-loop', '0', localExportPath)
      } else {
        args.push('-map', '0:v:0', '-map', '0:a?')
        if (spec.height) {
          args.push('-vf', `scale=-2:${spec.height}:force_original_aspect_ratio=decrease`)
        }

        if (spec.extension === 'webm') {
          args.push(
            '-c:v', 'libvpx-vp9',
            '-b:v', '0',
            '-crf', '33',
            '-c:a', 'libopus',
            localExportPath,
          )
        } else {
          args.push(
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            localExportPath,
          )
        }
      }

      await runProcess('ffmpeg', args)
      uploadBytes = await readFile(localExportPath)
      exportProbe = await probeMedia(ctx, localExportPath) ?? currentProbe
    } else {
      uploadBytes = await readFile(currentMediaPath)
      mimeType = primarySource.mimeType || mimeType
      localExportPath = currentMediaPath
    }

    const actualExtension = extname(localExportPath).replace('.', '') || spec.extension
    const outputPath = `${ctx.payload.output_path_prefix}/export/output_${format}.${actualExtension}`

    const { error } = await supabase.storage
      .from('job-artifacts')
      .upload(outputPath, uploadBytes, {
        contentType: mimeType,
        upsert: true,
      })

    if (error) {
      throw new Error(`Failed to upload export ${outputPath}: ${error.message}`)
    }

    ctx.artifacts.push({
      bucket: 'job-artifacts',
      path: outputPath,
      mimeType,
      sizeBytes: uploadBytes.byteLength,
      label: format,
    })

    ctx.metadata.exportInfo = [
      ...(((ctx.metadata.exportInfo as Array<Record<string, unknown>> | undefined) ?? [])),
      {
        format,
        durationSec: exportProbe?.durationSec ?? 0,
        resolution: exportProbe ? `${exportProbe.width}x${exportProbe.height}` : 'unknown',
        codec: exportProbe?.codec ?? spec.codec,
      },
    ]
  }
}

async function generateMetadataReport(ctx: EditingContext): Promise<void> {
  structuredLog('info', 'step_metadata_report', { jobId: ctx.jobId })
  const reportPath = `${ctx.payload.output_path_prefix}/metadata/report.json`
  const reportBytes = Buffer.from(JSON.stringify({
    jobId: ctx.jobId,
    sourceAssets: ctx.payload.source_assets,
    operations: ctx.payload.operations,
    exportFormats: ctx.payload.export_formats,
    sourceMetadata: getSourceFiles(ctx).map((file) => ({
      bucket: file.bucket,
      path: file.path,
      mimeType: file.mimeType,
      durationSec: file.durationSec ?? 0,
      resolution: file.width && file.height ? `${file.width}x${file.height}` : 'unknown',
      codec: file.codec ?? 'unknown',
    })),
    exportInfo: (ctx.metadata.exportInfo as Array<Record<string, unknown>> | undefined) ?? [],
    processingNotes: getProcessingNotes(ctx),
    toolchain: ctx.metadata.toolchain ?? null,
    generatedAt: new Date().toISOString(),
  }, null, 2))

  const { error } = await supabase.storage
    .from('job-artifacts')
    .upload(reportPath, reportBytes, {
      contentType: 'application/json',
      upsert: true,
    })

  if (error) {
    throw new Error(`Failed to upload metadata report: ${error.message}`)
  }

  ctx.artifacts.push({
    bucket: 'job-artifacts',
    path: reportPath,
    mimeType: 'application/json',
    sizeBytes: reportBytes.byteLength,
    label: 'metadata-report',
  })
}

// ── Pipeline Definition ─────────────────────────────────
const PIPELINE_STEPS: EditingStep[] = [
  { id: 'scene_assembly', description: 'Load source assets, validate, assemble timeline', fn: assembleScenes },
  { id: 'trim_cut', description: 'Apply trim and cut operations', fn: applyTrimCuts },
  { id: 'transitions', description: 'Render transition effects between scenes', fn: applyTransitions },
  { id: 'subtitle_generation', description: 'Run Whisper ASR for auto subtitles or apply manual SRT', fn: generateSubtitles },
  { id: 'lip_sync', description: 'Apply lip sync model if requested', fn: applyLipSync, gpuRequired: true },
  { id: 'color_grading', description: 'Apply LUT or preset color grade', fn: applyColorGrade },
  { id: 'audio_mixing', description: 'Normalize and mix audio tracks', fn: mixAudio },
  { id: 'watermark', description: 'Burn watermark if specified', fn: applyWatermark },
  { id: 'export', description: 'Encode to all requested output formats', fn: exportFormats, gpuRequired: true },
  { id: 'metadata_report', description: 'Generate metadata JSON', fn: generateMetadataReport },
]

// ── Main Agent Function ─────────────────────────────────
export async function editingAgent(
  payload: Record<string, unknown>,
  options?: EditingAgentOptions,
): Promise<AgentResult> {
  const startTime = Date.now()
  const editingPayload = payload as unknown as EditingJobPayload
  const jobId = (payload as Record<string, string>).jobId ?? 'unknown'
  const userId = (payload as Record<string, string>).userId ?? 'unknown'
  const workDir = await mkdtemp(join(tmpdir(), `editing-${jobId}-`))

  const ctx: EditingContext = {
    jobId,
    userId,
    payload: editingPayload,
    workDir,
    artifacts: [],
    timeline: null,
    metadata: {},
  }

  const stepsCompleted: string[] = []

  try {
    await emitProgress(
      ctx,
      options,
      buildProgressSnapshot('processing', null, 'Queued for editing', 0, PIPELINE_STEPS.length, stepsCompleted, getProcessingNotes(ctx)),
    )

    for (const [index, step] of PIPELINE_STEPS.entries()) {
      await emitProgress(
        ctx,
        options,
        buildProgressSnapshot('processing', step.id, step.description, index + 1, PIPELINE_STEPS.length, [...stepsCompleted], getProcessingNotes(ctx)),
      )

      structuredLog('info', 'pipeline_step_start', { jobId, step: step.id })
      const stepStart = Date.now()

      await step.fn(ctx)

      const stepDuration = Date.now() - stepStart
      stepsCompleted.push(step.id)
      await emitProgress(
        ctx,
        options,
        buildProgressSnapshot('processing', step.id, step.description, index + 1, PIPELINE_STEPS.length, [...stepsCompleted], getProcessingNotes(ctx)),
      )
      structuredLog('info', 'pipeline_step_done', {
        jobId,
        step: step.id,
        durationMs: stepDuration,
      })
    }

    const totalDuration = Date.now() - startTime
    const exportInfo = Array.isArray(ctx.metadata.exportInfo)
      ? ctx.metadata.exportInfo as Array<Record<string, unknown>>
      : []
    const currentProbe = getCurrentProbe(ctx)

    const result: EditingJobResult = {
      exports: ctx.artifacts
        .filter((a) => a.label !== 'metadata-report')
        .map((a) => ({
          format: a.label ?? 'mp4_1080p',
          bucket: a.bucket,
          path: a.path,
          size_bytes: a.sizeBytes,
          duration_sec: Number(exportInfo.find((item) => item.format === a.label)?.durationSec ?? currentProbe?.durationSec ?? 0),
          resolution: String(exportInfo.find((item) => item.format === a.label)?.resolution ?? (currentProbe ? `${currentProbe.width}x${currentProbe.height}` : 'unknown')),
          codec: String(exportInfo.find((item) => item.format === a.label)?.codec ?? currentProbe?.codec ?? 'h264'),
        })),
      metadata: {
        pipeline_version: '2.1.0',
        total_duration_sec: currentProbe?.durationSec ?? 0,
        steps_completed: stepsCompleted,
        processing_time_ms: totalDuration,
        gpu_utilized: PIPELINE_STEPS.some((s) => s.gpuRequired),
        processing_notes: getProcessingNotes(ctx),
        progress: buildProgressSnapshot('completed', null, 'Editing complete', PIPELINE_STEPS.length, PIPELINE_STEPS.length, stepsCompleted, getProcessingNotes(ctx)) as unknown as Record<string, unknown>,
        subtitle_mode: typeof ctx.metadata.subtitleMode === 'string' ? ctx.metadata.subtitleMode : null,
        subtitle_transcript: typeof ctx.metadata.subtitleTranscript === 'string' ? ctx.metadata.subtitleTranscript : null,
        subtitle_segment_count: Number(ctx.metadata.subtitleSegmentCount ?? 0),
        lip_sync_applied: Boolean(ctx.metadata.lipSyncApplied),
        lip_sync_model: typeof ctx.metadata.lipSyncModel === 'string' ? ctx.metadata.lipSyncModel : null,
        toolchain: (ctx.metadata.toolchain as Record<string, unknown> | undefined) ?? null,
      },
    }

    await emitProgress(
      ctx,
      options,
      ctx.metadata.progress as EditingProgress,
    )

    return {
      success: true,
      data: result as unknown as Record<string, unknown>,
      artifacts: ctx.artifacts,
    }
  } catch (err) {
    const failedProgress = buildProgressSnapshot('failed', null, 'Editing failed', stepsCompleted.length, PIPELINE_STEPS.length, stepsCompleted, getProcessingNotes(ctx))
    await emitProgress(ctx, options, failedProgress)

    return {
      success: false,
      error: err instanceof Error ? err.message : 'Editing pipeline failed',
      metadata: { stepsCompleted, processingNotes: getProcessingNotes(ctx), progress: failedProgress },
    }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
