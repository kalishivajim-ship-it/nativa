/**
 * Audio processing utilities for Gemini Live API
 */

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nextStartTime: number = 0;
  private audioQueue: Float32Array[] = [];
  private isPlaying: boolean = false;

  constructor(private onAudioData: (base64Data: string) => void) {}

  async startCapture() {
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
    
    // ScriptProcessor is deprecated but often more reliable for simple PCM streaming in this context
    // than AudioWorklet which requires separate files.
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmData = this.floatTo16BitPCM(inputData);
      const base64Data = this.arrayBufferToBase64(pcmData);
      this.onAudioData(base64Data);
    };
  }

  stopCapture() {
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.processor?.disconnect();
    this.source?.disconnect();
    this.audioContext?.close();
  }

  private floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Playback logic
  playAudioChunk(base64Data: string) {
    if (!this.audioContext) return;
    
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const pcmData = new Int16Array(bytes.buffer);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 32768.0;
    }

    const audioBuffer = this.audioContext.createBuffer(1, floatData.length, 24000);
    audioBuffer.getChannelData(0).set(floatData);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    const currentTime = this.audioContext.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.05; // Small buffer
    }

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  stopPlayback() {
    this.nextStartTime = 0;
    // In a more complex version, we'd track active sources and stop them
  }
}
