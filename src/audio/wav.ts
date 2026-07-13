/**
 * Lossless WAV recording: taps the master bus, accumulates raw PCM,
 * encodes RIFF/WAVE 16-bit stereo. No MediaRecorder lossy codecs.
 */
import * as Tone from "tone";

export class WavRecorder {
  private chunks: Float32Array[][] = [];
  private node: ScriptProcessorNode | null = null;
  recording = false;

  start(tap: Tone.ToneAudioNode): void {
    if (this.recording) return;
    const ctx = Tone.getContext().rawContext as AudioContext;
    this.chunks = [];
    this.node = ctx.createScriptProcessor(4096, 2, 2);
    this.node.onaudioprocess = (e) => {
      if (!this.recording) return;
      this.chunks.push([
        new Float32Array(e.inputBuffer.getChannelData(0)),
        new Float32Array(e.inputBuffer.getChannelData(1)),
      ]);
    };
    Tone.connect(tap, this.node);
    // ScriptProcessors only run when connected to the destination; route
    // through a muted gain so the tap isn't audibly doubled.
    const silent = ctx.createGain();
    silent.gain.value = 0;
    this.node.connect(silent);
    silent.connect(ctx.destination);
    this.recording = true;
  }

  stop(tap: Tone.ToneAudioNode): Blob {
    this.recording = false;
    if (this.node) {
      try {
        Tone.disconnect(tap, this.node);
        this.node.disconnect();
      } catch { /* already torn down */ }
      this.node = null;
    }
    return encodeWav(this.chunks, Tone.getContext().sampleRate);
  }
}

function encodeWav(chunks: Float32Array[][], sampleRate: number): Blob {
  const frames = chunks.reduce((s, c) => s + c[0].length, 0);
  const buffer = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + frames * 4, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 2, true); // stereo
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, frames * 4, true);

  let off = 44;
  for (const [l, r] of chunks) {
    for (let i = 0; i < l.length; i++) {
      view.setInt16(off, Math.max(-1, Math.min(1, l[i])) * 0x7fff, true);
      view.setInt16(off + 2, Math.max(-1, Math.min(1, r[i])) * 0x7fff, true);
      off += 4;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}
