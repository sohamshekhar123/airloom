/**
 * AirSynth factory presets: hand-tuned base recipes per category, each
 * expanded through sonic variants (voicing of cutoff, spread, envelope,
 * LFO) to a browsable bank of 100.
 */
import type { SynthPatch } from "../audio/synth";

type Base = Omit<SynthPatch, "name" | "category">;

const base = (b: Base): Base => b;

const BASES: { category: string; name: string; b: Base }[] = [
  // ------------------------------- PADS -------------------------------
  { category: "Pads", name: "Velvet", b: base({
    osc1: { shape: "fatsawtooth", octave: 0 },
    osc2: { shape: "sine", octave: -1, detune: 0, level: 0.5 },
    spread: 28, filter: { type: "lowpass", cutoff: 1400, q: 0.6 },
    env: { attack: 0.9, decay: 0.6, sustain: 0.8, release: 2.8 },
    lfo: { rate: 0.15, depth: 0.25, target: "cutoff" }, glide: 0, volume: -10 }) },
  { category: "Pads", name: "Aurora", b: base({
    osc1: { shape: "fattriangle", octave: 0 },
    osc2: { shape: "fatsawtooth", octave: 0, detune: 7, level: 0.35 },
    spread: 40, filter: { type: "lowpass", cutoff: 2200, q: 1.2 },
    env: { attack: 1.6, decay: 1, sustain: 0.75, release: 3.5 },
    lfo: { rate: 0.1, depth: 0.35, target: "cutoff" }, glide: 0, volume: -10 }) },
  { category: "Pads", name: "Choir Glass", b: base({
    osc1: { shape: "triangle", octave: 0 },
    osc2: { shape: "sine", octave: 1, detune: 5, level: 0.4 },
    spread: 0, filter: { type: "bandpass", cutoff: 1500, q: 1.5 },
    env: { attack: 1.2, decay: 0.8, sustain: 0.7, release: 3 },
    lfo: { rate: 4.5, depth: 0.12, target: "pitch" }, glide: 0, volume: -8 }) },
  // ------------------------------- KEYS -------------------------------
  { category: "Keys", name: "Fable EP", b: base({
    osc1: { shape: "sine", octave: 0 },
    osc2: { shape: "triangle", octave: 1, detune: 3, level: 0.25 },
    spread: 0, filter: { type: "lowpass", cutoff: 3200, q: 0.5 },
    env: { attack: 0.004, decay: 1.4, sustain: 0.25, release: 1.2 },
    lfo: { rate: 5.5, depth: 0.1, target: "volume" }, glide: 0, volume: -7 }) },
  { category: "Keys", name: "Tine Ivory", b: base({
    osc1: { shape: "triangle", octave: 0 },
    osc2: { shape: "sine", octave: 2, detune: 0, level: 0.15 },
    spread: 0, filter: { type: "lowpass", cutoff: 4200, q: 0.4 },
    env: { attack: 0.003, decay: 1.8, sustain: 0.15, release: 1 },
    lfo: null, glide: 0, volume: -6 }) },
  { category: "Keys", name: "Wurli Dust", b: base({
    osc1: { shape: "square", octave: 0 },
    osc2: { shape: "sine", octave: 0, detune: 6, level: 0.5 },
    spread: 0, filter: { type: "lowpass", cutoff: 1800, q: 1 },
    env: { attack: 0.005, decay: 1.1, sustain: 0.3, release: 0.8 },
    lfo: { rate: 6.5, depth: 0.15, target: "volume" }, glide: 0, volume: -9 }) },
  // ------------------------------- LEADS -------------------------------
  { category: "Leads", name: "Neon Wire", b: base({
    osc1: { shape: "sawtooth", octave: 0 },
    osc2: { shape: "square", octave: 0, detune: 9, level: 0.45 },
    spread: 0, filter: { type: "lowpass", cutoff: 3800, q: 2 },
    env: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.4 },
    lfo: { rate: 5, depth: 0.2, target: "pitch" }, glide: 0.04, volume: -9 }) },
  { category: "Leads", name: "Solar Flare", b: base({
    osc1: { shape: "fatsawtooth", octave: 0 },
    osc2: { shape: "fatsawtooth", octave: 1, detune: -8, level: 0.4 },
    spread: 55, filter: { type: "lowpass", cutoff: 5200, q: 1 },
    env: { attack: 0.02, decay: 0.4, sustain: 0.7, release: 0.5 },
    lfo: null, glide: 0.06, volume: -10 }) },
  // ------------------------------- BASS -------------------------------
  { category: "Bass", name: "Sub Loom", b: base({
    osc1: { shape: "sine", octave: -1 },
    osc2: { shape: "triangle", octave: 0, detune: 0, level: 0.3 },
    spread: 0, filter: { type: "lowpass", cutoff: 900, q: 0.5 },
    env: { attack: 0.005, decay: 0.4, sustain: 0.7, release: 0.3 },
    lfo: null, glide: 0.03, volume: -5 }) },
  { category: "Bass", name: "Rubber Growl", b: base({
    osc1: { shape: "fatsquare", octave: -1 },
    osc2: { shape: "sawtooth", octave: -1, detune: 12, level: 0.5 },
    spread: 20, filter: { type: "lowpass", cutoff: 700, q: 3 },
    env: { attack: 0.008, decay: 0.5, sustain: 0.5, release: 0.25 },
    lfo: { rate: 0.3, depth: 0.3, target: "cutoff" }, glide: 0.05, volume: -7 }) },
  // ------------------------------ PLUCKS ------------------------------
  { category: "Plucks", name: "Rainstick", b: base({
    osc1: { shape: "triangle", octave: 0 },
    osc2: { shape: "square", octave: 1, detune: 4, level: 0.2 },
    spread: 0, filter: { type: "lowpass", cutoff: 2600, q: 1.4 },
    env: { attack: 0.002, decay: 0.35, sustain: 0.02, release: 0.4 },
    lfo: null, glide: 0, volume: -7 }) },
  { category: "Plucks", name: "Koto Spark", b: base({
    osc1: { shape: "sawtooth", octave: 0 },
    osc2: null,
    spread: 0, filter: { type: "bandpass", cutoff: 2000, q: 2.5 },
    env: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.35 },
    lfo: null, glide: 0, volume: -6 }) },
  // ------------------------------ DREAMS ------------------------------
  { category: "Dreams", name: "Slow Motion", b: base({
    osc1: { shape: "fattriangle", octave: 0 },
    osc2: { shape: "sine", octave: -1, detune: -5, level: 0.6 },
    spread: 34, filter: { type: "lowpass", cutoff: 1100, q: 0.8 },
    env: { attack: 2.2, decay: 1.5, sustain: 0.85, release: 4.5 },
    lfo: { rate: 0.08, depth: 0.4, target: "cutoff" }, glide: 0.1, volume: -11 }) },
  { category: "Dreams", name: "Night Swim", b: base({
    osc1: { shape: "sine", octave: 0 },
    osc2: { shape: "fatsawtooth", octave: 0, detune: 6, level: 0.25 },
    spread: 46, filter: { type: "lowpass", cutoff: 1600, q: 1 },
    env: { attack: 1.4, decay: 1, sustain: 0.8, release: 3.8 },
    lfo: { rate: 4, depth: 0.18, target: "pitch" }, glide: 0.08, volume: -10 }) },
];

interface Variant {
  tag: string;
  mutate: (b: Base) => Partial<Base>;
}

const VARIANTS: Variant[] = [
  { tag: "", mutate: () => ({}) },
  { tag: "Warm", mutate: (b) => ({ filter: { ...b.filter, cutoff: b.filter.cutoff * 0.6 } }) },
  { tag: "Bright", mutate: (b) => ({ filter: { ...b.filter, cutoff: Math.min(b.filter.cutoff * 1.9, 9000) } }) },
  { tag: "Wide", mutate: (b) => ({ spread: Math.min(b.spread + 30, 80), osc2: b.osc2 ? { ...b.osc2, detune: b.osc2.detune + 6 } : null }) },
  { tag: "Soft", mutate: (b) => ({ env: { ...b.env, attack: b.env.attack * 2 + 0.05, release: b.env.release * 1.4 } }) },
  { tag: "Snappy", mutate: (b) => ({ env: { ...b.env, attack: 0.002, decay: Math.max(b.env.decay * 0.6, 0.1) } }) },
  { tag: "Haunted", mutate: (b) => ({ lfo: { rate: 0.2, depth: 0.45, target: "cutoff" as const }, filter: { ...b.filter, q: b.filter.q + 1.2 } }) },
];

function build(): SynthPatch[] {
  const out: SynthPatch[] = [];
  for (const { category, name, b } of BASES) {
    for (const v of VARIANTS) {
      out.push({
        ...b,
        ...v.mutate(b),
        name: v.tag ? `${v.tag} ${name}` : name,
        category,
      } as SynthPatch);
      if (out.length >= 98) break;
    }
    if (out.length >= 98) break;
  }
  // two signatures to round out the bank
  out.push({
    name: "Airloom Signature", category: "Dreams",
    osc1: { shape: "fatsawtooth", octave: 0 },
    osc2: { shape: "sine", octave: -1, detune: 4, level: 0.55 },
    spread: 38, filter: { type: "lowpass", cutoff: 1900, q: 0.9 },
    env: { attack: 0.7, decay: 0.8, sustain: 0.75, release: 3 },
    lfo: { rate: 0.12, depth: 0.3, target: "cutoff" }, glide: 0.02, volume: -9,
  });
  out.push({
    name: "First Thread", category: "Keys",
    osc1: { shape: "triangle", octave: 0 },
    osc2: { shape: "sine", octave: 1, detune: 2, level: 0.3 },
    spread: 0, filter: { type: "lowpass", cutoff: 3000, q: 0.6 },
    env: { attack: 0.004, decay: 1.5, sustain: 0.2, release: 1.1 },
    lfo: null, glide: 0, volume: -7,
  });
  return out;
}

export const SYNTH_PRESETS: SynthPatch[] = build();

export const PRESET_CATEGORIES = [...new Set(SYNTH_PRESETS.map((p) => p.category))];
