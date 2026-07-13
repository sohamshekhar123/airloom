/**
 * Per-track FX rack: chorus -> pitch -> drive -> delay -> reverb, serial.
 * Every unit idles at wet 0 so an untouched rack is transparent.
 */
import * as Tone from "tone";

export interface FxParams {
  chorus: { wet: number; depth: number };
  pitch: { wet: number; shift: number }; // semitones -12..+12
  drive: { wet: number; amount: number };
  delay: { wet: number; time: number; feedback: number };
  reverb: { wet: number; decay: number };
}

export const DEFAULT_FX: FxParams = {
  chorus: { wet: 0, depth: 0.5 },
  pitch: { wet: 0, shift: 0 },
  drive: { wet: 0, amount: 0.3 },
  delay: { wet: 0, time: 0.25, feedback: 0.3 },
  reverb: { wet: 0, decay: 2.5 },
};

export class FxChain {
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  private chorus: Tone.Chorus;
  private pitch: Tone.PitchShift;
  private drive: Tone.Distortion;
  private delay: Tone.FeedbackDelay;
  private reverb: Tone.Reverb;
  params: FxParams;

  constructor(params: FxParams = structuredClone(DEFAULT_FX)) {
    this.params = params;
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.chorus = new Tone.Chorus(1.8, 3.5, params.chorus.depth).start();
    this.pitch = new Tone.PitchShift(params.pitch.shift);
    this.drive = new Tone.Distortion(params.drive.amount);
    this.delay = new Tone.FeedbackDelay(params.delay.time, params.delay.feedback);
    this.reverb = new Tone.Reverb({ decay: params.reverb.decay });
    this.input.chain(this.chorus, this.pitch, this.drive, this.delay, this.reverb, this.output);
    this.set(params);
  }

  set(p: FxParams): void {
    this.params = p;
    this.chorus.wet.value = p.chorus.wet;
    this.chorus.depth = p.chorus.depth;
    this.pitch.wet.value = p.pitch.wet;
    this.pitch.pitch = p.pitch.shift;
    this.drive.wet.value = p.drive.wet;
    this.drive.distortion = p.drive.amount;
    this.delay.wet.value = p.delay.wet;
    this.delay.delayTime.rampTo(p.delay.time, 0.1);
    this.delay.feedback.rampTo(Math.min(p.delay.feedback, 0.85), 0.1);
    this.reverb.wet.value = p.reverb.wet;
    if (Math.abs(this.reverb.decay as number - p.reverb.decay) > 0.05) {
      this.reverb.decay = p.reverb.decay;
    }
  }

  dispose(): void {
    for (const n of [this.input, this.chorus, this.pitch, this.drive, this.delay, this.reverb, this.output]) {
      n.dispose();
    }
  }
}
