/**
 * AirSynth — Airloom's built-in synthesizer.
 *
 * Architecture inspired by open-source wavetable synths (Vital, Surge):
 * two oscillator banks -> shared filter -> amp envelope, with one LFO
 * routable to cutoff, pitch, or volume, plus glide and unison spread.
 * Implemented on Tone.js voices so it stays light enough for the browser.
 */
import * as Tone from "tone";
import { midiToFreq } from "../music/progressions";

export type OscShape =
  | "sine" | "triangle" | "sawtooth" | "square"
  | "fatsawtooth" | "fatsquare" | "fattriangle";

export type LfoTarget = "cutoff" | "pitch" | "volume";

export interface SynthPatch {
  name: string;
  category: string;
  osc1: { shape: OscShape; octave: number };
  osc2: { shape: OscShape; octave: number; detune: number; level: number } | null;
  spread: number; // unison spread cents for fat shapes
  filter: { type: "lowpass" | "highpass" | "bandpass"; cutoff: number; q: number };
  env: { attack: number; decay: number; sustain: number; release: number };
  lfo: { rate: number; depth: number; target: LfoTarget } | null;
  glide: number;
  volume: number; // dB
}

export class AirSynth {
  readonly output: Tone.Gain;
  private s1: Tone.PolySynth;
  private s2: Tone.PolySynth;
  private filter: Tone.Filter;
  private vib: Tone.Vibrato;
  private lfo: Tone.LFO | null = null;
  private patch: SynthPatch;

  constructor(patch: SynthPatch) {
    this.patch = patch;
    this.output = new Tone.Gain(1);
    this.filter = new Tone.Filter(patch.filter.cutoff, patch.filter.type);
    this.filter.Q.value = patch.filter.q;
    this.filter.connect(this.output);
    this.vib = new Tone.Vibrato(5, 0).connect(this.filter);

    this.s1 = new Tone.PolySynth(Tone.Synth);
    this.s2 = new Tone.PolySynth(Tone.Synth);
    this.s1.connect(this.vib);
    this.s2.connect(this.vib);
    this.s1.maxPolyphony = 16;
    this.s2.maxPolyphony = 16;
    this.apply(patch);
  }

  /** Live-update every parameter (preset switch or knob turn). */
  apply(p: SynthPatch): void {
    this.patch = p;
    const voice = (shape: OscShape, extraDetune: number) => ({
      oscillator: {
        type: shape,
        ...(shape.startsWith("fat") ? { count: 3, spread: p.spread } : {}),
      } as Tone.SynthOptions["oscillator"],
      envelope: { ...p.env },
      portamento: p.glide,
      detune: extraDetune,
    });
    this.s1.set(voice(p.osc1.shape, p.osc1.octave * 1200));
    this.s1.volume.value = p.volume + (p.osc2 ? -3 : 0);
    if (p.osc2) {
      this.s2.set(voice(p.osc2.shape, p.osc2.octave * 1200 + p.osc2.detune));
      this.s2.volume.value = p.volume + Tone.gainToDb(Math.max(p.osc2.level, 0.001));
    } else {
      this.s2.volume.value = -Infinity;
    }
    this.filter.type = p.filter.type;
    this.filter.frequency.rampTo(p.filter.cutoff, 0.05);
    this.filter.Q.rampTo(p.filter.q, 0.05);
    this.applyLfo(p);
  }

  private applyLfo(p: SynthPatch): void {
    this.lfo?.dispose();
    this.lfo = null;
    this.vib.depth.value = 0;
    if (!p.lfo || p.lfo.depth <= 0.001) return;
    const { rate, depth, target } = p.lfo;
    if (target === "cutoff") {
      this.lfo = new Tone.LFO(
        rate,
        Math.max(80, p.filter.cutoff * (1 - depth)),
        p.filter.cutoff * (1 + depth * 0.5),
      );
      this.lfo.connect(this.filter.frequency);
      this.lfo.start();
    } else if (target === "volume") {
      this.lfo = new Tone.LFO(rate, 1 - depth, 1);
      this.lfo.connect(this.output.gain);
      this.lfo.start();
    } else {
      // pitch wobble via the vibrato stage
      this.vib.frequency.value = rate;
      this.vib.depth.value = depth * 0.5;
    }
  }

  triggerAttackRelease(
    notes: number | number[] | string | string[],
    dur: number,
    time?: number,
    vel?: number,
  ): void {
    const freqs = (Array.isArray(notes) ? notes : [notes]).map((n) =>
      typeof n === "number" && n < 200 ? midiToFreq(n) : n,
    ) as number[] | string[];
    this.s1.triggerAttackRelease(freqs, dur, time, vel);
    if (this.patch.osc2) this.s2.triggerAttackRelease(freqs, dur, time, vel);
  }

  releaseAll(time?: number): void {
    this.s1.releaseAll(time);
    this.s2.releaseAll(time);
  }

  connect(dest: Tone.InputNode): this {
    this.output.connect(dest);
    return this;
  }

  disconnect(): this {
    this.output.disconnect();
    return this;
  }

  dispose(): void {
    this.lfo?.dispose();
    this.s1.dispose();
    this.s2.dispose();
    this.vib.dispose();
    this.filter.dispose();
    this.output.dispose();
  }

  get currentPatch(): SynthPatch {
    return this.patch;
  }
}
