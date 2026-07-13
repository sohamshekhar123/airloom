/**
 * The Harmonic Constraint Engine.
 *
 * Users pick a PROGRESSION (by vibe, not theory) and step through it with a
 * push of their hand. Every chord ships with pre-built voicings at three
 * richness levels, so whatever the hands do, it sounds intentional.
 */

export interface Chord {
  /** Display name (e.g. "Am7") */
  name: string;
  /** MIDI voicings: bass note, core triad, lush extensions */
  notes: {
    bass: number;
    triad: number[];
    extensions: number[];
  };
}

export interface Progression {
  id: string;
  label: string;
  vibe: string;
  chords: Chord[];
}

const chord = (
  name: string,
  bass: number,
  triad: number[],
  extensions: number[],
): Chord => ({ name, notes: { bass, triad, extensions } });

export const PROGRESSIONS: Progression[] = [
  {
    id: "anthem",
    label: "Anthem",
    vibe: "the four chords of every hit",
    chords: [
      chord("C", 36, [48, 52, 55], [59, 62]),
      chord("G", 43, [55, 59, 62], [66, 69]),
      chord("Am", 45, [57, 60, 64], [67, 71]),
      chord("F", 41, [53, 57, 60], [64, 67]),
    ],
  },
  {
    id: "heartache",
    label: "Heartache",
    vibe: "sad but beautiful",
    chords: [
      chord("Am", 33, [45, 48, 52], [55, 59]),
      chord("F", 41, [53, 57, 60], [64, 67]),
      chord("C", 36, [48, 52, 55], [59, 62]),
      chord("G", 43, [55, 59, 62], [66, 69]),
    ],
  },
  {
    id: "velvet",
    label: "Velvet",
    vibe: "late-night jazz bar",
    chords: [
      chord("Dm7", 38, [50, 53, 57], [60, 64]),
      chord("G7", 43, [55, 59, 62], [65, 69]),
      chord("Cmaj7", 36, [48, 52, 55], [59, 64]),
      chord("Am7", 45, [57, 60, 64], [67, 71]),
    ],
  },
  {
    id: "daydream",
    label: "Daydream",
    vibe: "floating, weightless",
    chords: [
      chord("Fmaj7", 41, [53, 57, 60], [64, 69]),
      chord("C", 36, [48, 52, 55], [59, 64]),
      chord("G", 43, [55, 59, 62], [66, 71]),
      chord("Am7", 45, [57, 60, 64], [67, 72]),
    ],
  },
  {
    id: "shadow",
    label: "Shadow",
    vibe: "dark and cinematic",
    chords: [
      chord("Em", 40, [52, 55, 59], [62, 66]),
      chord("C", 36, [48, 52, 55], [59, 62]),
      chord("G", 43, [55, 59, 62], [66, 69]),
      chord("D", 38, [50, 54, 57], [61, 64]),
    ],
  },
];

/* ------------------------- chord palette & builders ------------------------- */

type Quality = "maj" | "min" | "dom7" | "maj7" | "min7";

/** Build a chord from a root (MIDI, octave 3) + quality, with consistent
 *  bass/triad/extension voicings matching the hand-tuned presets above. */
export function buildChord(name: string, root: number, quality: Quality): Chord {
  const third = quality === "min" || quality === "min7" ? 3 : 4;
  const seventh = quality === "maj" || quality === "maj7" ? 11 : 10;
  return chord(
    name,
    root - 12,
    [root, root + third, root + 7],
    [root + seventh, root + 14],
  );
}

/** Toggled piano notes -> a playable custom chord. */
export function chordFromNotes(notes: number[]): Chord | null {
  if (notes.length === 0) return null;
  const sorted = [...notes].sort((a, b) => a - b);
  return {
    name: "MINE",
    notes: {
      bass: sorted[0] - 12,
      triad: sorted,
      extensions: [sorted[sorted.length - 1] + 12],
    },
  };
}

/** The mix-and-match palette: every chord a beginner will ever need. */
export const CHORD_PALETTE: Chord[] = [
  buildChord("C", 48, "maj"),
  buildChord("Dm", 50, "min"),
  buildChord("Em", 52, "min"),
  buildChord("F", 53, "maj"),
  buildChord("G", 55, "maj"),
  buildChord("Am", 57, "min"),
  buildChord("D", 50, "maj"),
  buildChord("E", 52, "maj"),
  buildChord("A", 57, "maj"),
  buildChord("Bm", 59, "min"),
  buildChord("Cmaj7", 48, "maj7"),
  buildChord("Dm7", 50, "min7"),
  buildChord("Em7", 52, "min7"),
  buildChord("Fmaj7", 53, "maj7"),
  buildChord("G7", 55, "dom7"),
  buildChord("Am7", 57, "min7"),
];

/** Richness levels driven by the left hand's height. */
export type VoicingLevel = 0 | 1 | 2; // 0 = bass only, 1 = chord, 2 = lush

export function voiceChord(c: Chord, level: VoicingLevel): number[] {
  if (level === 0) return [c.notes.bass, c.notes.bass + 12];
  if (level === 1) return [c.notes.bass, ...c.notes.triad];
  return [c.notes.bass, ...c.notes.triad, ...c.notes.extensions];
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
