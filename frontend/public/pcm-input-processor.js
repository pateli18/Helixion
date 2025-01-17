class PCMInputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const micData = input[0];
    
    for (let i = 0; i < micData.length; i++) {
      // Convert Float32 to Int16
      const sample = Math.max(-1, Math.min(1, micData[i]));
      this.buffer[this.bufferIndex++] = Math.round(sample * 32767);

      // Only send when buffer is completely full
      if (this.bufferIndex === this.bufferSize) {
        this.port.postMessage({
          type: 'mic-data',
          buffer: this.buffer.buffer
        }, [this.buffer.buffer]);

        this.buffer = new Int16Array(this.bufferSize);
        this.bufferIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-input-processor", PCMInputProcessor);
