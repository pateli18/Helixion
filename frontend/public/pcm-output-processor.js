class PCMOutputProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
  
      // A queue of Float32Array chunks waiting to be played
      this.bufferQueue = [];
  
      // Listen for messages from the main thread
      this.port.onmessage = (event) => {
        const msg = event.data
        if (msg?.type === 'push-buffer') {
          // event.data.payload is a Float32Array
          this.bufferQueue.push(msg.payload);
        } else if (msg?.type === 'clear-buffers') {
          // clear buffer queue
          this.bufferQueue = [];
          this.currentChunk = null;
          this.readIndex = 0;
        }
      };
  
      // We'll track our reading position in the current chunk
      this.currentChunk = null;
      this.readIndex = 0;
    }
  
    process(inputs, outputs) {
      const output = outputs[0];
      // Assuming mono (single channel) for simplicity
      const channelData = output[0];
  
      let offset = 0;
      while (offset < channelData.length) {
        // If we don’t have a chunk or we’ve exhausted the current chunk, grab the next one
        if (!this.currentChunk || this.readIndex >= this.currentChunk.length) {
          if (this.currentChunk) {
            // Notify main thread that chunk finished
            this.port.postMessage({
              type: 'chunkEnd',
            });
          }

          this.currentChunk = this.bufferQueue.shift() || null;
          this.readIndex = 0;
          // If no data in the queue, fill remainder with silence
          if (!this.currentChunk) {
            while (offset < channelData.length) {
              channelData[offset++] = 0;
            }
            break;
          }
        }
  
        // Calculate how many samples we can copy from the current chunk
        const samplesToCopy = Math.min(
          this.currentChunk.length - this.readIndex,
          channelData.length - offset
        );
  
        channelData.set(
          this.currentChunk.subarray(
            this.readIndex,
            this.readIndex + samplesToCopy
          ),
          offset
        );
  
        offset += samplesToCopy;
        this.readIndex += samplesToCopy;
      }
  
      // Return true to keep the processor alive
      return true;
    }
  }
  
  // Register the processor so it can be used via `new AudioWorkletNode(...)`
  registerProcessor('pcm-output-processor', PCMOutputProcessor);