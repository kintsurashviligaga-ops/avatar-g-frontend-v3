class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const processorOptions = (options && options.processorOptions) || {};
    this.frameSize = Number(processorOptions.frameSize || 320);
    this.chunk = new Int16Array(this.frameSize);
    this.offset = 0;
    this.rmsAccumulator = 0;
    this.rmsCount = 0;
  }

  flushChunk() {
    if (this.offset <= 0) {
      return;
    }

    const view = this.chunk.slice(0, this.offset);
    const rms = this.rmsCount > 0 ? Math.sqrt(this.rmsAccumulator / this.rmsCount) : 0;

    this.port.postMessage(
      {
        type: 'pcm16',
        buffer: view.buffer,
        rms,
      },
      [view.buffer]
    );

    this.offset = 0;
    this.rmsAccumulator = 0;
    this.rmsCount = 0;
  }

  process(inputs) {
    const channel = inputs?.[0]?.[0];
    if (!channel || channel.length === 0) {
      return true;
    }

    for (let index = 0; index < channel.length; index += 1) {
      const sample = channel[index] || 0;
      const clipped = Math.max(-1, Math.min(1, sample));

      this.rmsAccumulator += clipped * clipped;
      this.rmsCount += 1;

      const pcmSample = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
      this.chunk[this.offset] = Math.round(pcmSample);
      this.offset += 1;

      if (this.offset >= this.frameSize) {
        this.flushChunk();
      }
    }

    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
