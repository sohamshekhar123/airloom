/**
 * UI state only. High-frequency data (landmarks, velocities) NEVER goes
 * through React — it stays in refs and canvas draws. This store holds the
 * slow, discrete stuff the UI actually re-renders on.
 */
import { create } from "zustand";
import { MOODS, type Mood } from "../music/moods";

export type Screen = "welcome" | "loading" | "stage" | "error";

interface AirloomState {
  screen: Screen;
  errorMessage: string;
  mood: Mood;
  playing: boolean;
  chordName: string;
  beat: number;
  hoverLane: string | null;
  voicing: number;
  muted: boolean;
  quality: number;

  setScreen: (s: Screen, error?: string) => void;
  setMood: (m: Mood) => void;
  setPlaying: (p: boolean) => void;
  setChord: (name: string) => void;
  setBeat: (b: number) => void;
  setPerformance: (p: {
    hoverLane: string | null;
    voicing: number;
    muted: boolean;
    quality: number;
  }) => void;
}

export const useStore = create<AirloomState>((set) => ({
  screen: "welcome",
  errorMessage: "",
  mood: MOODS[0],
  playing: false,
  chordName: "",
  beat: 0,
  hoverLane: null,
  voicing: 1,
  muted: false,
  quality: 0,

  setScreen: (screen, errorMessage = "") => set({ screen, errorMessage }),
  setMood: (mood) => set({ mood }),
  setPlaying: (playing) => set({ playing }),
  setChord: (chordName) => set({ chordName }),
  setBeat: (beat) => set({ beat }),
  setPerformance: (p) =>
    set((s) =>
      s.hoverLane === p.hoverLane &&
      s.voicing === p.voicing &&
      s.muted === p.muted &&
      Math.abs(s.quality - p.quality) < 0.15
        ? s
        : p,
    ),
}));
