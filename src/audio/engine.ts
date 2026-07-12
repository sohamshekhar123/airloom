/**
 * Airloom's sound engine, built on Tone.js.
 *
 * The master clock is the AUDIO clock (Tone.Transport on AudioContext time),
 * never a JS timer. Strikes from the camera are scheduled at the next 16th-note
 * grid slot — "commit-ahead scheduling" — so every hit lands sample-accurately
 * on the beat no matter how laggy the webcam is. Camera latency becomes
 * musically invisible instead of musically fatal.
 */
import * as Tone from "tone";
import {
  MOODS,
  midiToFreq,
  voiceChord,
  type Mood,
  type VoicingLevel,
} from "../music/moods";
import type { Lane } from "../gestures/interpreter";

export type BeatCallback = (beatInBar: number) => void;
export type ChordCallback = (chordName: string, index: number) => void;

class AirloomEngine {
  private started = false;
  private mood: Mood = MOODS[0];
  private chordIndex = 0;
  private voicing: VoicingLevel = 1;
  private muted = false;

  private pad!: Tone.PolySynth;
  private stab!: Tone.PolySynth;
  private arpSynth!: Tone.Synth;
  private kick!: Tone.MembraneSynth;
  private clap!: Tone.NoiseSynth;
  private hat!: Tone.NoiseSynth;
  private padFilter!: Tone.Filter;
  private padVolume!: Tone.Volume;

  onBeat: BeatCallback | null = null;
  onChord: ChordCallback | null = null;

  /** Must be called from a user gesture (browser autoplay policy). */
  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();

    const reverb = new Tone.Reverb({ decay: 4, wet: 0.35 }).toDestination();
    const limiter = new Tone.Limiter(-3).connect(reverb);

    this.padFilter = new Tone.Filter(1200, "lowpass").connect(limiter);
    this.padVolume = new Tone.Volume(-8).connect(this.padFilter);
    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 3, spread: 24 },
      envelope: { attack: 0.6, decay: 0.4, sustain: 0.7, release: 2.2 },
    }).connect(this.padVolume);
    this.pad.maxPolyphony = 12;

    this.stab = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.35, sustain: 0.1, release: 0.6 },
      volume: -6,
    }).connect(limiter);
    this.stab.maxPolyphony = 12;

    this.arpSynth = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.003, decay: 0.18, sustain: 0.02, release: 0.25 },
      volume: -10,
    }).connect(
      new Tone.PingPongDelay({ delayTime: "8n", feedback: 0.3, wet: 0.3 }).connect(
        limiter,
      ),
    );

    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 7,
      envelope: { attack: 0.001, decay: 0.45, sustain: 0 },
      volume: -2,
    }).connect(limiter);

    this.clap = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.002, decay: 0.18, sustain: 0 },
      volume: -8,
    }).connect(limiter);

    this.hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
      volume: -16,
    }).connect(limiter);

    // Chord changes every bar; beat pulse every quarter for the UI.
    Tone.getTransport().scheduleRepeat((time) => {
      this.chordIndex = (this.chordIndex + 1) % this.mood.progression.length;
      this.playPadChord(time);
      const name = this.mood.progression[this.chordIndex].name;
      const idx = this.chordIndex;
      Tone.getDraw().schedule(() => this.onChord?.(name, idx), time);
    }, "1m", "1m");

    Tone.getTransport().scheduleRepeat((time) => {
      const pos = Tone.getTransport().position.toString();
      const beat = parseInt(pos.split(":")[1] ?? "0", 10);
      Tone.getDraw().schedule(() => this.onBeat?.(beat), time);
    }, "4n");

    this.started = true;
  }

  play(): void {
    if (!this.started) return;
    Tone.getTransport().bpm.value = this.mood.bpm;
    Tone.getTransport().start();
    this.chordIndex = 0;
    this.playPadChord(Tone.now() + 0.05);
    this.onChord?.(this.mood.progression[0].name, 0);
  }

  stop(): void {
    Tone.getTransport().stop();
    Tone.getTransport().cancel(0);
    this.pad?.releaseAll();
    this.started = false; // force re-schedule of repeats on next start
  }

  get isRunning(): boolean {
    return this.started && Tone.getTransport().state === "started";
  }

  setMood(mood: Mood): void {
    this.mood = mood;
    this.chordIndex = 0;
    if (this.isRunning) {
      Tone.getTransport().bpm.rampTo(mood.bpm, 1);
      this.playPadChord(Tone.now() + 0.05);
      this.onChord?.(mood.progression[0].name, 0);
    }
  }

  get currentMood(): Mood {
    return this.mood;
  }

  /** Left hand height -> voicing complexity + pad brightness. Continuous path. */
  setHarmony(voicing: VoicingLevel, height: number): void {
    if (!this.started) return;
    // Brightness sweeps 300Hz..6kHz with height — slow-attack sound masks latency
    this.padFilter.frequency.rampTo(300 + height * 5700, 0.08);
    if (voicing !== this.voicing) {
      this.voicing = voicing;
      if (this.isRunning && !this.muted) this.playPadChord(Tone.now() + 0.02);
    }
  }

  /** Closed fist = dampen. Opening = swell back. */
  setMuted(muted: boolean): void {
    if (!this.started || muted === this.muted) return;
    this.muted = muted;
    if (muted) {
      this.pad.releaseAll();
      this.padVolume.volume.rampTo(-40, 0.15);
    } else {
      this.padVolume.volume.rampTo(-8, 0.4);
      if (this.isRunning) this.playPadChord(Tone.now() + 0.02);
    }
  }

  /**
   * Commit-ahead scheduling: fire at the next 16th-note grid slot on the
   * audio clock. Returns the delay (ms) until it sounds, for UI feedback.
   */
  strike(lane: Lane, velocity: number): number {
    if (!this.started) return 0;
    if (!this.isRunning) {
      this.triggerLane(lane, velocity, Tone.now());
      return 0;
    }
    const transport = Tone.getTransport();
    const gridTime = transport.nextSubdivision("16n");
    transport.scheduleOnce((time) => this.triggerLane(lane, velocity, time), gridTime);
    return Math.max(0, (gridTime - transport.seconds) * 1000);
  }

  private triggerLane(lane: Lane, velocity: number, time: number): void {
    const chordDef = this.mood.progression[this.chordIndex];
    if (lane === "drum") {
      this.kick.triggerAttackRelease("C1", "8n", time, velocity);
      this.hat.triggerAttackRelease("16n", time + 0.001, velocity * 0.7);
      if (velocity > 0.7) {
        this.clap.triggerAttackRelease("8n", time + 0.002, velocity);
      }
    } else if (lane === "chord") {
      const notes = voiceChord(chordDef, Math.max(this.voicing, 1) as VoicingLevel);
      this.stab.triggerAttackRelease(
        notes.map(midiToFreq),
        "8n",
        time,
        velocity,
      );
    } else {
      // arp: a quick 16th-note run up the current chord + octave
      const base = [...chordDef.notes.triad, chordDef.notes.triad[0] + 12];
      const sixteenth = Tone.Time("16n").toSeconds();
      base.forEach((midi, i) => {
        this.arpSynth.triggerAttackRelease(
          midiToFreq(midi),
          "16n",
          time + i * sixteenth,
          velocity * (1 - i * 0.12),
        );
      });
    }
  }

  private playPadChord(time: number): void {
    if (this.muted) return;
    const chordDef = this.mood.progression[this.chordIndex];
    const notes = voiceChord(chordDef, this.voicing);
    this.pad.releaseAll(time);
    this.pad.triggerAttack(notes.map(midiToFreq), time, 0.6);
  }
}

/** Singleton — one audio engine per page. */
export const engine = new AirloomEngine();
