/**
 * UI state only. High-frequency data (landmarks) never touches React — it
 * flows ref -> canvas -> audio. This store holds the slow, discrete state
 * the top bar re-renders on; continuous values are rounded before writing
 * so 60Hz hand motion doesn't become 60Hz React renders.
 */
import { create } from "zustand";
import { PROGRESSIONS, type Chord } from "../music/progressions";
import type { TrackMeta } from "../audio/engine";

export type Screen = "welcome" | "loading" | "stage" | "error";
export type StudioTab = "tracks" | "synth" | "fx" | "sampler";

interface PerfSnapshot {
  rightOn: boolean;
  leftOn: boolean;
  volume: number; // 0..1, rounded to 0.05
  rate: number; // 0..4
  vibrato: number; // 0..1, rounded to 0.05
  voicing: number; // 0..2
  velocity: number; // 0..1, rounded to 0.05
  pinching: boolean;
  quality: number; // rounded to 0.2
}

interface AirloomState extends PerfSnapshot {
  screen: Screen;
  errorMessage: string;
  /** the working progression — editable in the Loom */
  chords: Chord[];
  progressionLabel: string;
  instrumentId: string;
  bpm: number;
  playing: boolean;
  chordName: string;
  chordStep: number;
  loomOpen: boolean;
  selectedSlot: number;
  recording: boolean;
  recordFormat: "wav" | "webm";
  studioOpen: boolean;
  studioTab: StudioTab;
  tracks: TrackMeta[];
  selectedTrackId: number;

  setScreen: (s: Screen, error?: string) => void;
  setPerf: (p: PerfSnapshot) => void;
  setChord: (name: string, step: number) => void;
}

const round = (v: number, q: number) => Math.round(v / q) * q;

export const useStore = create<AirloomState>((set) => ({
  screen: "welcome",
  errorMessage: "",
  chords: PROGRESSIONS[0].chords,
  progressionLabel: PROGRESSIONS[0].label,
  instrumentId: "piano",
  bpm: 100,
  playing: false,
  chordName: "",
  chordStep: 0,
  loomOpen: false,
  selectedSlot: 0,
  recording: false,
  recordFormat: "wav",
  studioOpen: false,
  studioTab: "tracks",
  tracks: [],
  selectedTrackId: 1,

  rightOn: false,
  leftOn: false,
  volume: 0,
  rate: 2,
  vibrato: 0,
  voicing: 1,
  velocity: 0.8,
  pinching: false,
  quality: 0,

  setScreen: (screen, errorMessage = "") => set({ screen, errorMessage }),
  setChord: (chordName, chordStep) => set({ chordName, chordStep }),
  setPerf: (p) =>
    set((s) => {
      const next: PerfSnapshot = {
        rightOn: p.rightOn,
        leftOn: p.leftOn,
        volume: round(p.volume, 0.05),
        rate: p.rate,
        vibrato: round(p.vibrato, 0.05),
        voicing: p.voicing,
        velocity: round(p.velocity, 0.05),
        pinching: p.pinching,
        quality: round(p.quality, 0.2),
      };
      for (const k of Object.keys(next) as (keyof PerfSnapshot)[]) {
        if (next[k] !== s[k]) return next;
      }
      return s;
    }),
}));
