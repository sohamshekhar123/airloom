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
