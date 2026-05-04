export type VadTransition = 'none' | 'speech_start' | 'speech_end';

export type AdaptiveVadOptions = {
  minRms?: number;
  speechMultiplier?: number;
  speechFrames?: number;
  silenceFrames?: number;
  noiseAdaptation?: number;
};

export class AdaptiveEnergyVad {
  private readonly minRms: number;
  private readonly speechMultiplier: number;
  private readonly speechFramesThreshold: number;
  private readonly silenceFramesThreshold: number;
  private readonly noiseAdaptation: number;

  private speaking = false;
  private noiseFloor = 0.006;
  private speechFrames = 0;
  private silenceFrames = 0;

  constructor(options: AdaptiveVadOptions = {}) {
    this.minRms = options.minRms ?? 0.007;
    this.speechMultiplier = options.speechMultiplier ?? 2.4;
    this.speechFramesThreshold = options.speechFrames ?? 3;
    this.silenceFramesThreshold = options.silenceFrames ?? 8;
    this.noiseAdaptation = options.noiseAdaptation ?? 0.06;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  reset(): void {
    this.speaking = false;
    this.speechFrames = 0;
    this.silenceFrames = 0;
  }

  update(rms: number): VadTransition {
    const boundedRms = Number.isFinite(rms) ? Math.max(0, Math.min(1, rms)) : 0;

    if (!this.speaking) {
      this.noiseFloor =
        this.noiseFloor + (boundedRms - this.noiseFloor) * this.noiseAdaptation;
    }

    const threshold = Math.max(this.minRms, this.noiseFloor * this.speechMultiplier);
    const isSpeechFrame = boundedRms >= threshold;

    if (!this.speaking) {
      if (isSpeechFrame) {
        this.speechFrames += 1;
        if (this.speechFrames >= this.speechFramesThreshold) {
          this.speaking = true;
          this.speechFrames = 0;
          this.silenceFrames = 0;
          return 'speech_start';
        }
      } else {
        this.speechFrames = 0;
      }

      return 'none';
    }

    if (isSpeechFrame) {
      this.silenceFrames = 0;
      return 'none';
    }

    this.silenceFrames += 1;
    if (this.silenceFrames >= this.silenceFramesThreshold) {
      this.speaking = false;
      this.silenceFrames = 0;
      return 'speech_end';
    }

    return 'none';
  }
}
