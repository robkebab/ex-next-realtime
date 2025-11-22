// AudioWorklet processor for real-time audio streaming
// This runs on a separate audio processing thread for better performance

class AudioStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // Buffer size for chunking audio data
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  // Convert Float32 audio samples to PCM16 format
  float32ToPCM16(float32Array) {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp the value between -1 and 1
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit integer
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16;
  }

  // Encode PCM16 data to base64
  pcm16ToBase64(pcm16Array) {
    const bytes = new Uint8Array(pcm16Array.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    // Process only if there's input data
    if (input && input.length > 0) {
      const inputChannel = input[0]; // Get first channel (mono)
      
      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex++] = inputChannel[i];
        
        // When buffer is full, process and send it
        if (this.bufferIndex >= this.bufferSize) {
          // Convert to PCM16 and encode to base64
          const pcm16Data = this.float32ToPCM16(this.buffer);
          const base64Audio = this.pcm16ToBase64(pcm16Data);
          
          // Send the encoded audio to the main thread
          this.port.postMessage({
            type: 'audio',
            data: base64Audio,
          });
          
          // Reset buffer
          this.bufferIndex = 0;
        }
      }
    }
    
    // Keep the processor alive
    return true;
  }
}

// Register the processor
registerProcessor('audio-stream-processor', AudioStreamProcessor);

