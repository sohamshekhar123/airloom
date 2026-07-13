/**
 * Airloom's sound engine, built on Tone.js.
 *
 * The instrument is a continuous PATTERN PLAYER conducted by the hands:
 * a 16th-note tick on the audio clock decides, each slot, whether to sound
 * notes of the current chord — at the rate, volume, velocity, richness and
 * vibrato the hands are currently expressing. The master clock is the
 * AUDIO clock (Tone.Transport), never a JS timer, so everything stays in time
 * regardless of camera latency.
 *
 * Instruments are real sampled instruments (Tone.Sampler over CDN-hosted
 * sample sets), with a synth fallback that needs no network.
 */
import * as Tone from "tone";
import {
  PROGRESSIONS,
  midiToFreq,
  voiceChord,
  type Chord,
  type VoicingLevel,
} from "../music/progressions";

export interface InstrumentDef {
  id: string;
  label: string;
}

export const INSTRUMENTS: InstrumentDef[] = [
  { id: "piano", label: "Grand Piano" },
  { id: "guitar", label: "Acoustic Guitar" },
  { id: "harp", label: "Harp" },
  { id: "dream", label: "Dream Synth" },
];

const SAMPLE_SETS: Record<string, { baseUrl: string; urls: Record<string, string> }> = {
  piano: {
    baseUrl: "https://tonejs.github.io/audio/salamander/",
    urls: {
      A1: "A1.mp3", A2: "A2.mp3", A3: "A3.mp3", A4: "A4.mp3", A5: "A5.mp3",
      C2: "C2.mp3", C3: "C3.mp3", C4: "C4.mp3", C5: "C5.mp3", C6: "C6.mp3",
      "F#2": "Fs2.mp3", "F#3": "Fs3.mp3", "F#4": "Fs4.mp3",
    },
  },
  guitar: {
    baseUrl: "https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-acoustic/",
    urls: {
      E2: "E2.mp3", A2: "A2.mp3", C3: "C3.mp3", E3: "E3.mp3",
      A3: "A3.mp3", C4: "C4.mp3", E4: "E4.mp3", G4: "G4.mp3",
    },
  },
  harp: {
    baseUrl: "https://nbrosowsky.github.io/tonejs-instruments/samples/harp/",
    urls: {
      B1: "B1.mp3", D2: "D2.mp3", F2: "F2.mp3", A2: "A2.mp3",
      C3: "C3.mp3", E3: "E3.mp3", G3: "G3.mp3", B3: "B3.mp3",
      D4: "D4.mp3", F4: "F4.mp3", A4: "A4.mp3",
      C5: "C5.mp3", E5: "E5.mp3", G5: "G5.mp3",
    },
  },
};

/** 16th-note steps between notes for each rate setting. */
const STEPS_PER_RATE = [16, 8, 4, 2, 1]; // HOLD, 1/2, 1/4, 1/8, 1/16

type Playable = Tone.Sampler | Tone.PolySynth;

class AirloomEngine {
  private started = false;
  private chords: Chord[] = PROGRESSIONS[0].chords;
  private chordIndex = 0;
  private editorMode = false;

  // hand-driven expression (written every frame, read on audio ticks)
  private volume = 0; // 0..1 from right-hand openness
  private rateIndex = 2;
  private voicing: VoicingLevel = 1;
  private velocity = 0.8;

  private step = 0;
  private arpIdx = 0;
  private wasAudible = false;
  private chordDirty = false;

  private instruments = new Map<string, Playable>();
  private current: Playable | null = null;
  private currentId = "";

  private vibrato!: Tone.Vibrato;
  private gate!: Tone.Gain;
  private recorder!: Tone.Recorder;

  onChord: ((name: string, index: number) => void) | null = null;
  onBeat: ((beat: number) => void) | null = null;

  /** Must be called from a user gesture (browser autoplay policy). */
  async start(defaultInstrument = "piano"): Promise<void> {
    if (this.started) return;
    await Tone.start();

    const reverb = new Tone.Reverb({ decay: 3.2, wet: 0.28 }).toDestination();
    this.recorder = new Tone.Recorder();
    reverb.connect(this.recorder);
    const limiter = new Tone.Limiter(-2).connect(reverb);
    const trim = new Tone.Volume(-4).connect(limiter);
    this.gate = new Tone.Gain(0).connect(trim);
    this.vibrato = new Tone.Vibrato(5, 0).connect(this.gate);

    const transport = Tone.getTransport();
    transport.scheduleRepeat((time) => this.tick(time), "16n");
    transport.scheduleRepeat((time) => {
      const beat = parseInt(transport.position.toString().split(":")[1] ?? "0", 10);
      Tone.getDraw().schedule(() => this.onBeat?.(beat), time);
    }, "4n");

    await this.setInstrument(defaultInstrument);
    this.started = true;
  }

  play(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
    Tone.getTransport().start();
    this.onChord?.(this.chords[this.chordIndex].name, this.chordIndex);
  }

  pause(): void {
    Tone.getTransport().pause();
    this.releaseAll();
  }

  get isRunning(): boolean {
    return Tone.getTransport().state === "started";
  }

  setBpm(bpm: number): void {
    Tone.getTransport().bpm.rampTo(bpm, 0.4);
  }

  /** Replace the working progression (from presets or the Loom editor). */
  setChords(chords: Chord[], resetIndex = false): void {
    this.chords = chords;
    if (resetIndex || this.chordIndex >= chords.length) this.chordIndex = 0;
    this.chordDirty = true;
    this.onChord?.(chords[this.chordIndex].name, this.chordIndex);
  }

  /** The invisible button: right hand pinches. */
  advanceChord(): void {
    this.chordIndex = (this.chordIndex + 1) % this.chords.length;
    this.chordDirty = true;
    this.arpIdx = 0;
    this.onChord?.(this.chords[this.chordIndex].name, this.chordIndex);
  }

  /** While the Loom editor is open, keep the pattern audible even if the
   *  hands are down, so edits are heard immediately. */
  setEditorMode(on: boolean): void {
    this.editorMode = on;
    if (on && this.started) this.gate.gain.rampTo(0.6, 0.2);
  }

  /** Audition a single piano-key click through the current instrument. */
  previewNote(midi: number): void {
    this.current?.triggerAttackRelease(midiToFreq(midi), 0.5, Tone.now(), 0.8);
  }

  /* ------------------------------- recording ------------------------------- */

  startRecording(): void {
    if (this.recorder.state !== "started") this.recorder.start();
  }

  async stopRecording(): Promise<Blob> {
    return this.recorder.stop();
  }

  get isRecording(): boolean {
    return this.recorder?.state === "started";
  }

  /** Continuous, called every video frame from the gesture loop. */
  setExpression(volume: number, rateIndex: number, vibratoAmt: number): void {
    if (!this.started) return;
    this.volume = this.editorMode ? Math.max(volume, 0.6) : volume;
    this.rateIndex = rateIndex;
    // perceptual volume curve; fully closed fist is silence
    const v = this.volume;
    const gain = v < 0.06 ? 0 : Math.pow(v, 1.6);
    this.gate.gain.rampTo(gain, 0.09);
    this.vibrato.depth.rampTo(vibratoAmt * 0.45, 0.12);
  }

  setVoicing(v: VoicingLevel): void {
    if (v !== this.voicing) {
      this.voicing = v;
      this.chordDirty = true; // re-voice held chords at the next slot
    }
  }

  setVelocity(v: number): void {
    this.velocity = v;
  }

  async setInstrument(id: string): Promise<void> {
    if (id === this.currentId) return;
    let inst = this.instruments.get(id);
    if (!inst) {
      inst = await this.createInstrument(id);
      this.instruments.set(id, inst);
    }
    this.releaseAll();
    this.current?.disconnect();
    this.current = inst;
    this.currentId = id;
    inst.connect(this.vibrato);
  }

  get instrumentId(): string {
    return this.currentId;
  }

  private async createInstrument(id: string): Promise<Playable> {
    if (id === "dream") {
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 3, spread: 22 },
        envelope: { attack: 0.04, decay: 0.3, sustain: 0.6, release: 1.6 },
        volume: -8,
      });
      synth.maxPolyphony = 16;
      return synth;
    }
    const set = SAMPLE_SETS[id];
    const sampler = new Tone.Sampler({ urls: set.urls, baseUrl: set.baseUrl });
    await Tone.loaded();
    return sampler;
  }

  /* --------------------- the pattern player (audio clock) --------------------- */

  private tick(time: number): void {
    const audible = this.volume >= 0.06;
    if (!audible) {
      if (this.wasAudible) this.releaseAll();
      this.wasAudible = false;
      return;
    }

    const justOpened = !this.wasAudible;
    this.wasAudible = true;
    this.step++;

    const stepsPerNote = STEPS_PER_RATE[this.rateIndex];
    const due = this.step % stepsPerNote === 0;
    // fire immediately when the hand opens or the chord changes in slow modes,
    // instead of waiting out a long subdivision
    const force = (justOpened || this.chordDirty) && this.rateIndex <= 1;
    if (!due && !force) {
      if (this.chordDirty && this.rateIndex > 1) {
        // arp modes just pick up the new chord on their next due note
        this.arpIdx = 0;
      }
      return;
    }
    if (force) this.step = 0;
    this.chordDirty = false;

    const chordDef = this.chords[this.chordIndex];
    const notes = voiceChord(chordDef, this.voicing);
    const inst = this.current;
    if (!inst) return;

    const sixteenth = Tone.Time("16n").toSeconds();
    const vel = 0.25 + this.velocity * 0.75;

    if (this.rateIndex === 0) {
      // HOLD: lush sustained chord, re-struck each bar
      this.releaseAll(time);
      inst.triggerAttackRelease(
        notes.map(midiToFreq),
        Tone.Time("1m").toSeconds(),
        time,
        vel,
      );
    } else if (this.rateIndex === 1) {
      // 1/2: gentle strum
      notes.forEach((midi, i) => {
        inst.triggerAttackRelease(
          midiToFreq(midi),
          Tone.Time("2n").toSeconds(),
          time + i * 0.028,
          vel * (1 - i * 0.06),
        );
      });
    } else {
      // arpeggio: cycle chord tones + octave sparkle on top
      const pool = [...notes, notes[notes.length - 1] + 12];
      const midi = pool[this.arpIdx % pool.length];
      this.arpIdx++;
      inst.triggerAttackRelease(
        midiToFreq(midi),
        sixteenth * stepsPerNote * 1.6,
        time,
        vel,
      );
    }
  }

  private releaseAll(time?: number): void {
    this.current?.releaseAll(time);
  }
}

/** Singleton — one audio engine per page. */
export const engine = new AirloomEngine();
