/**
 * The Harmonic Constraint Engine.
 *
 * Users never see scales, keys, or roman numerals — they pick a MOOD.
 * Each mood locks the whole instrument to a scale + a looping 4-chord
 * progression that is guaranteed to sound good. You cannot play a wrong note.
 */

export interface Mood {
  id: string;
  label: string;
  emoji: string;
  tagline: string;
  bpm: number;
  /** Accent color used by the UI for this mood */
  color: string;
  /** MIDI note numbers of the scale (one octave, starting at the root) */
  scale: number[];
  /** Chord roots as MIDI notes — a looping 4-chord progression */
  progression: Chord[];
}

export interface Chord {
  /** Display name shown subtly in the UI (e.g. "Am") */
  name: string;
  /** MIDI note numbers, low to high: [bass, root, third, fifth, ext...] */
  notes: {
    bass: number;
    triad: number[];
    extensions: number[];
  };
}

const chord = (
  name: string,
  bass: number,
  triad: number[],
  extensions: number[],
): Chord => ({ name, notes: { bass, triad, extensions } });

// C4 = 60. Voicings sit around C3–C5 so pads feel warm, not muddy.
export const MOODS: Mood[] = [
  {
    id: "chill",
    label: "Chill",
    emoji: "🌊",
    tagline: "sunset drive",
    bpm: 92,
    color: "#3ef0b6",
    // C major pentatonic for melodies
    scale: [60, 62, 64, 67, 69, 72, 74, 76],
    // I – V – vi – IV in C
    progression: [
      chord("C", 36, [48, 52, 55], [59, 62]),
      chord("G", 43, [55, 59, 62], [66, 69]),
      chord("Am", 45, [57, 60, 64], [67, 71]),
      chord("F", 41, [53, 57, 60], [64, 67]),
    ],
  },
  {
    id: "moody",
    label: "Moody",
    emoji: "🌘",
    tagline: "3am thoughts",
    bpm: 80,
    color: "#8f7bff",
    // A natural minor
    scale: [57, 59, 60, 62, 64, 65, 67, 69],
    // i – VI – III – VII in Am
    progression: [
      chord("Am", 33, [45, 48, 52], [55, 59]),
      chord("F", 41, [53, 57, 60], [64, 67]),
      chord("C", 36, [48, 52, 55], [59, 62]),
      chord("G", 43, [55, 59, 62], [66, 69]),
    ],
  },
  {
    id: "hype",
    label: "Hype",
    emoji: "⚡",
    tagline: "main character",
    bpm: 124,
    color: "#ff5c38",
    // E minor pentatonic
    scale: [64, 67, 69, 71, 74, 76, 79, 81],
    // i – VI – III – VII in Em
    progression: [
      chord("Em", 40, [52, 55, 59], [62, 66]),
      chord("C", 36, [48, 52, 55], [59, 62]),
      chord("G", 43, [55, 59, 62], [66, 69]),
      chord("D", 38, [50, 54, 57], [61, 64]),
    ],
  },
  {
    id: "dreamy",
    label: "Dreamy",
    emoji: "☁️",
    tagline: "floating away",
    bpm: 72,
    color: "#ffb02e",
    // F lydian-flavored major
    scale: [65, 67, 69, 71, 72, 74, 76, 77],
    // IV – I – V – vi in C, starting on F for lift
    progression: [
      chord("Fmaj7", 41, [53, 57, 60], [64, 69]),
      chord("C", 36, [48, 52, 55], [59, 64]),
      chord("G", 43, [55, 59, 62], [66, 71]),
      chord("Am7", 45, [57, 60, 64], [67, 72]),
    ],
  },
];

/** Voicing complexity levels driven by the left hand's height. */
export type VoicingLevel = 0 | 1 | 2; // 0 = bass only, 1 = triad, 2 = extended

/** Build the notes to actually play for a chord at a given complexity. */
export function voiceChord(c: Chord, level: VoicingLevel): number[] {
  if (level === 0) return [c.notes.bass];
  if (level === 1) return [c.notes.bass, ...c.notes.triad];
  return [c.notes.bass, ...c.notes.triad, ...c.notes.extensions];
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
