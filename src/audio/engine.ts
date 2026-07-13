/**
 * Airloom's sound engine — now a small DAW.
 *
 * TRACKS: each track owns an instrument (sampled / AirSynth / user sampler),
 * a vibrato stage, an FX rack, volume and pan. The hands play the ARMED
 * track; other tracks play back their recorded loop clips.
 *
 * CLOCK: everything runs on the audio clock (Tone.Transport). Hand strikes
 * and pattern hits land on the 16th-note grid; loop clips are Tone.Parts
 * quantized to bar boundaries.
 *
 * The pattern player hits the FULL CHORD as one at every rate (HOLD
 * sustains, 1/2 strums, 1/4–1/16 are rhythmic chord pulses).
 */
import * as Tone from "tone";
import {
  PROGRESSIONS,
  midiToFreq,
  voiceChord,
  type Chord,
  type VoicingLevel,
} from "../music/progressions";
import { AirSynth, type SynthPatch } from "./synth";
import { SYNTH_PRESETS } from "../music/presets";
import { FxChain, DEFAULT_FX, type FxParams } from "./fx";
import { WavRecorder } from "./wav";

/* ------------------------------- instruments ------------------------------- */

export type TrackKind = "sampled" | "synth" | "sampler";

export const SAMPLED_INSTRUMENTS = [
  { id: "piano", label: "Grand Piano" },
  { id: "guitar", label: "Acoustic Guitar" },
  { id: "harp", label: "Harp" },
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

interface Playable {
  triggerAttackRelease(
    notes: number[] | string[] | number | string,
    dur: number,
    time?: number,
    vel?: number,
  ): void;
  releaseAll(time?: number): void;
  connect(dest: Tone.InputNode): unknown;
  disconnect(): unknown;
  dispose(): void;
}

/** Wraps Tone.Sampler / PolySynth so midi numbers are accepted uniformly. */
class SamplerWrap implements Playable {
  constructor(private inner: Tone.Sampler) {}
  triggerAttackRelease(notes: number[] | number | string[] | string, dur: number, time?: number, vel?: number) {
    const arr = (Array.isArray(notes) ? notes : [notes]).map((n) =>
      typeof n === "number" ? midiToFreq(n) : n,
    );
    this.inner.triggerAttackRelease(arr, dur, time, vel);
  }
  releaseAll(time?: number) { this.inner.releaseAll(time); }
  connect(d: Tone.InputNode) { return this.inner.connect(d); }
  disconnect() { return this.inner.disconnect(); }
  dispose() { this.inner.dispose(); }
}

/* --------------------------------- tracks --------------------------------- */

export interface NoteEvent {
  time: number; // seconds from loop start
  notes: number[];
  dur: number;
  vel: number;
}

export interface TrackMeta {
  id: number;
  name: string;
  kind: TrackKind;
  sourceId: string; // sampled id, patch name, or sample filename
  armed: boolean;
  muted: boolean;
  soloed: boolean;
  gain: number; // 0..1
  pan: number; // -1..1
  hasClip: boolean;
  recording: boolean;
  recPending: boolean;
  loading: boolean;
}

class Track {
  playable: Playable | null = null;
  patch: SynthPatch | null = null;
  sampleBuffer: AudioBuffer | null = null;
  sampleRoot = 60;
  vibrato = new Tone.Vibrato(5, 0);
  fx: FxChain;
  vol = new Tone.Volume(0);
  pan = new Tone.Panner(0);
  gate = new Tone.Gain(1);
  clip: NoteEvent[] | null = null;
  part: Tone.Part<NoteEvent> | null = null;
  loopBars = 4;
  meta: TrackMeta;

  constructor(meta: TrackMeta, master: Tone.ToneAudioNode, fxParams?: FxParams) {
    this.meta = meta;
    this.fx = new FxChain(fxParams);
    this.vibrato.connect(this.gate);
    this.gate.connect(this.fx.input);
    this.fx.output.connect(this.vol);
    this.vol.connect(this.pan);
    this.pan.connect(master);
  }

  attach(p: Playable): void {
    this.playable?.disconnect();
    this.playable?.dispose();
    this.playable = p;
    p.connect(this.vibrato);
  }

  applyMix(anySolo: boolean): void {
    const audible = !this.meta.muted && (!anySolo || this.meta.soloed);
    this.vol.volume.rampTo(audible ? Tone.gainToDb(Math.max(this.meta.gain, 0.001)) : -Infinity, 0.05);
    this.pan.pan.rampTo(this.meta.pan, 0.05);
  }

  dispose(): void {
    this.part?.dispose();
    this.playable?.dispose();
    this.vibrato.dispose();
    this.gate.dispose();
    this.fx.dispose();
    this.vol.dispose();
    this.pan.dispose();
  }
}

/* --------------------------------- engine --------------------------------- */

const STEPS_PER_RATE = [16, 8, 4, 2, 1]; // HOLD, 1/2, 1/4, 1/8, 1/16

class AirloomEngine {
  private started = false;
  private chords: Chord[] = PROGRESSIONS[0].chords;
  private chordIndex = 0;
  private editorMode = false;

  private volume = 0;
  private rateIndex = 2;
  private voicing: VoicingLevel = 1;
  private velocity = 0.8;

  private step = 0;
  private wasAudible = false;
  private chordDirty = false;

  private tracks: Track[] = [];
  private nextTrackId = 1;
  private master!: Tone.Gain;

  private recorder!: Tone.Recorder;
  private wavRecorder = new WavRecorder();
  recordFormat: "wav" | "webm" = "wav";

  // loop recording state
  private recTrack: Track | null = null;
  private recStart = 0; // transport seconds at loop start
  private recEvents: NoteEvent[] = [];
  loopBars = 4;

  onChord: ((name: string, index: number) => void) | null = null;
  onBeat: ((beat: number) => void) | null = null;
  onTracks: ((tracks: TrackMeta[]) => void) | null = null;

  /* ------------------------------ lifecycle ------------------------------ */

  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();

    this.master = new Tone.Gain(0.9);
    const limiter = new Tone.Limiter(-1.5).toDestination();
    this.master.connect(limiter);
    this.recorder = new Tone.Recorder();
    this.master.connect(this.recorder);

    const transport = Tone.getTransport();
    transport.scheduleRepeat((time) => this.tick(time), "16n");
    transport.scheduleRepeat((time) => {
      const beat = parseInt(transport.position.toString().split(":")[1] ?? "0", 10);
      Tone.getDraw().schedule(() => this.onBeat?.(beat), time);
    }, "4n");

    this.started = true;
    if (this.tracks.length === 0) {
      await this.addTrack("sampled", "piano", "Keys");
      this.tracks[0].meta.armed = true;
      this.emitTracks();
    }
  }

  play(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
    Tone.getTransport().start();
    this.onChord?.(this.chords[this.chordIndex].name, this.chordIndex);
  }

  pause(): void {
    Tone.getTransport().pause();
    this.tracks.forEach((t) => t.playable?.releaseAll());
  }

  get isRunning(): boolean {
    return Tone.getTransport().state === "started";
  }

  setBpm(bpm: number): void {
    Tone.getTransport().bpm.rampTo(bpm, 0.4);
  }

  /* -------------------------------- tracks -------------------------------- */

  get trackMetas(): TrackMeta[] {
    return this.tracks.map((t) => ({ ...t.meta }));
  }

  private emitTracks(): void {
    this.onTracks?.(this.trackMetas);
  }

  private get armed(): Track | null {
    return this.tracks.find((t) => t.meta.armed) ?? null;
  }

  track(id: number): Track | undefined {
    return this.tracks.find((t) => t.meta.id === id);
  }

  async addTrack(kind: TrackKind, sourceId: string, name?: string): Promise<number> {
    const id = this.nextTrackId++;
    const meta: TrackMeta = {
      id,
      name: name ?? `Track ${id}`,
      kind,
      sourceId,
      armed: false,
      muted: false,
      soloed: false,
      gain: 0.85,
      pan: 0,
      hasClip: false,
      recording: false,
      recPending: false,
      loading: true,
    };
    const t = new Track(meta, this.master);
    this.tracks.push(t);
    this.emitTracks();
    await this.setTrackSource(id, kind, sourceId);
    return id;
  }

  removeTrack(id: number): void {
    const i = this.tracks.findIndex((t) => t.meta.id === id);
    if (i === -1 || this.tracks.length <= 1) return;
    const [t] = this.tracks.splice(i, 1);
    t.dispose();
    if (t.meta.armed && this.tracks[0]) this.tracks[0].meta.armed = true;
    this.applyMix();
    this.emitTracks();
  }

  async setTrackSource(id: number, kind: TrackKind, sourceId: string, buffer?: AudioBuffer, root?: number): Promise<void> {
    const t = this.track(id);
    if (!t) return;
    t.meta.loading = true;
    t.meta.kind = kind;
    t.meta.sourceId = sourceId;
    this.emitTracks();
    try {
      if (kind === "sampled") {
        const set = SAMPLE_SETS[sourceId];
        const sampler = new Tone.Sampler({ urls: set.urls, baseUrl: set.baseUrl });
        await Tone.loaded();
        t.attach(new SamplerWrap(sampler));
        t.patch = null;
      } else if (kind === "synth") {
        const patch = SYNTH_PRESETS.find((p) => p.name === sourceId) ?? SYNTH_PRESETS[0];
        if (t.playable instanceof AirSynth) {
          t.playable.apply(patch);
        } else {
          t.attach(new AirSynth(patch));
        }
        t.patch = { ...patch };
      } else if (kind === "sampler" && (buffer || t.sampleBuffer)) {
        if (buffer) t.sampleBuffer = buffer;
        if (root) t.sampleRoot = root;
        const note = Tone.Frequency(t.sampleRoot, "midi").toNote();
        const sampler = new Tone.Sampler({ urls: { [note]: new Tone.ToneAudioBuffer(t.sampleBuffer!) } });
        t.attach(new SamplerWrap(sampler));
        t.patch = null;
      }
    } finally {
      t.meta.loading = false;
      this.emitTracks();
    }
  }

  /** Live-edit the armed/selected synth track's patch. */
  applyPatch(id: number, patch: SynthPatch): void {
    const t = this.track(id);
    if (t?.playable instanceof AirSynth) {
      t.playable.apply(patch);
      t.patch = { ...patch };
      t.meta.sourceId = patch.name;
      this.emitTracks();
    }
  }

  getPatch(id: number): SynthPatch | null {
    return this.track(id)?.patch ?? null;
  }

  setFx(id: number, params: FxParams): void {
    this.track(id)?.fx.set(params);
  }

  getFx(id: number): FxParams | null {
    const t = this.track(id);
    return t ? structuredClone(t.fx.params) : null;
  }

  updateTrackMeta(id: number, patch: Partial<TrackMeta>): void {
    const t = this.track(id);
    if (!t) return;
    if (patch.armed) this.tracks.forEach((x) => (x.meta.armed = x === t));
    Object.assign(t.meta, patch);
    this.applyMix();
    this.emitTracks();
  }

  private applyMix(): void {
    const anySolo = this.tracks.some((t) => t.meta.soloed);
    this.tracks.forEach((t) => t.applyMix(anySolo));
  }

  /* ---------------------------- loop recording ---------------------------- */

  /** Arm loop-record: starts at the next bar, runs loopBars, then loops. */
  requestLoopRecord(id: number): void {
    const t = this.track(id);
    if (!t || !this.isRunning) return;
    this.updateTrackMeta(id, { armed: true, recPending: true });
    const transport = Tone.getTransport();
    transport.scheduleOnce((time) => {
      this.recTrack = t;
      this.recStart = transport.seconds;
      this.recEvents = [];
      t.meta.recPending = false;
      t.meta.recording = true;
      Tone.getDraw().schedule(() => this.emitTracks(), time);
      const loopSecs = Tone.Time("1m").toSeconds() * this.loopBars;
      transport.scheduleOnce(() => this.finishLoopRecord(), transport.seconds + loopSecs);
    }, transport.nextSubdivision("1m"));
  }

  cancelLoopRecord(): void {
    if (this.recTrack) {
      this.recTrack.meta.recording = false;
      this.recTrack.meta.recPending = false;
      this.recTrack = null;
      this.emitTracks();
    }
  }

  private finishLoopRecord(): void {
    const t = this.recTrack;
    if (!t) return;
    this.recTrack = null;
    t.meta.recording = false;
    t.clip = this.recEvents;
    t.meta.hasClip = this.recEvents.length > 0;
    if (t.meta.hasClip) this.startClip(t);
    this.emitTracks();
  }

  private startClip(t: Track): void {
    t.part?.dispose();
    if (!t.clip?.length) return;
    const loopSecs = Tone.Time("1m").toSeconds() * this.loopBars;
    t.part = new Tone.Part<NoteEvent>((time, ev) => {
      t.playable?.triggerAttackRelease(ev.notes, ev.dur, time, ev.vel);
    }, t.clip);
    t.part.loop = true;
    t.part.loopEnd = loopSecs;
    t.part.start(Tone.getTransport().nextSubdivision("1m"));
  }

  clearClip(id: number): void {
    const t = this.track(id);
    if (!t) return;
    t.part?.dispose();
    t.part = null;
    t.clip = null;
    t.meta.hasClip = false;
    this.emitTracks();
  }

  /* ----------------------------- performance ----------------------------- */

  setChords(chords: Chord[], resetIndex = false): void {
    this.chords = chords;
    if (resetIndex || this.chordIndex >= chords.length) this.chordIndex = 0;
    this.chordDirty = true;
    this.onChord?.(chords[this.chordIndex].name, this.chordIndex);
  }

  advanceChord(): void {
    this.chordIndex = (this.chordIndex + 1) % this.chords.length;
    this.chordDirty = true;
    this.onChord?.(this.chords[this.chordIndex].name, this.chordIndex);
  }

  setEditorMode(on: boolean): void {
    this.editorMode = on;
  }

  previewNote(midi: number): void {
    this.armed?.playable?.triggerAttackRelease([midi], 0.5, Tone.now(), 0.8);
  }

  setExpression(volume: number, rateIndex: number, vibratoAmt: number): void {
    if (!this.started) return;
    this.volume = this.editorMode ? Math.max(volume, 0.6) : volume;
    this.rateIndex = rateIndex;
    const a = this.armed;
    if (a) {
      const v = this.volume;
      a.gate.gain.rampTo(v < 0.06 ? 0 : Math.pow(v, 1.6), 0.09);
      a.vibrato.depth.rampTo(vibratoAmt * 0.45, 0.12);
    }
  }

  setVoicing(v: VoicingLevel): void {
    if (v !== this.voicing) {
      this.voicing = v;
      this.chordDirty = true;
    }
  }

  setVelocity(v: number): void {
    this.velocity = v;
  }

  /** The pattern player: full chords as one, at the hand-chosen rate. */
  private tick(time: number): void {
    const audible = this.volume >= 0.06;
    const a = this.armed;
    if (!audible || !a?.playable) {
      if (this.wasAudible) a?.playable?.releaseAll();
      this.wasAudible = false;
      return;
    }

    const justOpened = !this.wasAudible;
    this.wasAudible = true;
    this.step++;

    const stepsPerNote = STEPS_PER_RATE[this.rateIndex];
    const due = this.step % stepsPerNote === 0;
    const force = justOpened || (this.chordDirty && this.rateIndex <= 1);
    if (!due && !force) return;
    if (force) this.step = 0;
    this.chordDirty = false;

    const chordDef = this.chords[this.chordIndex];
    const notes = voiceChord(chordDef, this.voicing);
    const sixteenth = Tone.Time("16n").toSeconds();
    const vel = 0.25 + this.velocity * 0.75;

    if (this.rateIndex === 0) {
      // HOLD: sustained chord, re-struck each bar
      a.playable.releaseAll(time);
      a.playable.triggerAttackRelease(notes, Tone.Time("1m").toSeconds(), time, vel);
      this.capture(time, notes, Tone.Time("1m").toSeconds(), vel);
    } else if (this.rateIndex === 1) {
      // 1/2: gentle strum of the whole chord
      notes.forEach((midi, i) => {
        a.playable!.triggerAttackRelease([midi], Tone.Time("2n").toSeconds(), time + i * 0.028, vel * (1 - i * 0.06));
      });
      this.capture(time, notes, Tone.Time("2n").toSeconds(), vel);
    } else {
      // rhythmic chord pulses — the chord always sounds as ONE
      const dur = sixteenth * stepsPerNote * 0.92;
      a.playable.triggerAttackRelease(notes, dur, time, vel);
      this.capture(time, notes, dur, vel);
    }
  }

  private capture(_time: number, notes: number[], dur: number, vel: number): void {
    if (!this.recTrack || this.recTrack !== this.armed) return;
    const loopSecs = Tone.Time("1m").toSeconds() * this.loopBars;
    const rel = (Tone.getTransport().seconds - this.recStart) % loopSecs;
    this.recEvents.push({ time: Math.max(rel, 0), notes: [...notes], dur, vel });
  }

  /* ------------------------------- recording ------------------------------- */

  startRecording(): void {
    if (this.recordFormat === "wav") this.wavRecorder.start(this.master);
    else if (this.recorder.state !== "started") this.recorder.start();
  }

  async stopRecording(): Promise<{ blob: Blob; ext: string }> {
    if (this.recordFormat === "wav") {
      return { blob: this.wavRecorder.stop(this.master), ext: "wav" };
    }
    return { blob: await this.recorder.stop(), ext: "webm" };
  }

  /* -------------------------------- project -------------------------------- */

  serialize(chords: Chord[], label: string, bpm: number): string {
    return JSON.stringify({
      version: 1,
      app: "airloom",
      bpm,
      label,
      chords,
      loopBars: this.loopBars,
      tracks: this.tracks.map((t) => ({
        name: t.meta.name,
        kind: t.meta.kind,
        sourceId: t.meta.sourceId,
        gain: t.meta.gain,
        pan: t.meta.pan,
        muted: t.meta.muted,
        patch: t.patch,
        fx: t.fx.params,
        clip: t.clip,
        sampleRoot: t.sampleRoot,
        sample: t.sampleBuffer ? bufferToB64(t.sampleBuffer) : null,
      })),
    });
  }

  async load(json: string): Promise<{ chords: Chord[]; label: string; bpm: number }> {
    const p = JSON.parse(json);
    if (p.app !== "airloom") throw new Error("Not an Airloom project file");
    // clear existing tracks
    for (const t of [...this.tracks]) {
      t.dispose();
    }
    this.tracks = [];
    this.loopBars = p.loopBars ?? 4;
    this.setChords(p.chords, true);
    for (const st of p.tracks) {
      const id = await this.addTrack(st.kind === "sampler" && !st.sample ? "sampled" : st.kind,
        st.kind === "sampler" && !st.sample ? "piano" : st.sourceId, st.name);
      const t = this.track(id)!;
      if (st.kind === "synth" && st.patch) this.applyPatch(id, st.patch);
      if (st.kind === "sampler" && st.sample) {
        const buf = await b64ToBuffer(st.sample);
        await this.setTrackSource(id, "sampler", st.sourceId, buf, st.sampleRoot);
      }
      t.fx.set(st.fx ?? structuredClone(DEFAULT_FX));
      Object.assign(t.meta, { gain: st.gain, pan: st.pan, muted: st.muted });
      if (st.clip?.length) {
        t.clip = st.clip;
        t.meta.hasClip = true;
        if (this.isRunning) this.startClip(t);
      }
    }
    if (this.tracks[0]) this.tracks[0].meta.armed = true;
    this.applyMix();
    this.emitTracks();
    return { chords: p.chords, label: p.label ?? "My Weave", bpm: p.bpm ?? 100 };
  }

  restartClips(): void {
    this.tracks.forEach((t) => {
      if (t.clip?.length && !t.part) this.startClip(t);
    });
  }
}

/* --------------------------------- helpers --------------------------------- */

function bufferToB64(buf: AudioBuffer): { rate: number; channels: string[] } {
  const channels: string[] = [];
  for (let c = 0; c < Math.min(buf.numberOfChannels, 2); c++) {
    const f32 = buf.getChannelData(c);
    const bytes = new Uint8Array(f32.buffer.slice(0));
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    channels.push(btoa(bin));
  }
  return { rate: buf.sampleRate, channels };
}

async function b64ToBuffer(data: { rate: number; channels: string[] }): Promise<AudioBuffer> {
  const ctx = Tone.getContext().rawContext;
  const chans = data.channels.map((b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  });
  const buf = ctx.createBuffer(chans.length, chans[0].length, data.rate);
  chans.forEach((c, i) => buf.copyToChannel(c, i));
  return buf;
}

/** Singleton — one audio engine per page. */
export const engine = new AirloomEngine();
