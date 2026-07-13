/**
 * The Studio drawer: TRACKS / SYNTH / FX / SAMPLER tabs.
 * Same hardware language as the rest of the instrument.
 */
import { useEffect, useRef, useState } from "react";
import { engine, SAMPLED_INSTRUMENTS, type TrackMeta } from "../audio/engine";
import { SYNTH_PRESETS, PRESET_CATEGORIES } from "../music/presets";
import type { SynthPatch, OscShape, LfoTarget } from "../audio/synth";
import { DEFAULT_FX, type FxParams } from "../audio/fx";
import { useStore, type StudioTab } from "../state/store";

const TABS: { id: StudioTab; label: string }[] = [
  { id: "tracks", label: "TRACKS" },
  { id: "synth", label: "SYNTH" },
  { id: "fx", label: "FX" },
  { id: "sampler", label: "SAMPLER" },
];

export function Studio() {
  const { studioTab, tracks, selectedTrackId } = useStore();
  const selected = tracks.find((t) => t.id === selectedTrackId) ?? tracks[0];

  const close = () => useStore.setState({ studioOpen: false });

  return (
    <section className="studio">
      <header className="studio-head">
        <div className="studio-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`studio-tab ${studioTab === t.id ? "on" : ""}`}
              onClick={() => useStore.setState({ studioTab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
        {selected && studioTab !== "tracks" && (
          <span className="studio-target">→ {selected.name}</span>
        )}
        <button className="loom-close" onClick={close}>✕</button>
      </header>

      {studioTab === "tracks" && <TracksTab />}
      {studioTab === "synth" && selected && <SynthTab track={selected} />}
      {studioTab === "fx" && selected && <FxTab track={selected} />}
      {studioTab === "sampler" && selected && <SamplerTab track={selected} />}
    </section>
  );
}

/* ---------------------------------- TRACKS ---------------------------------- */

function TracksTab() {
  const { tracks, selectedTrackId } = useStore();

  const add = async () => {
    const id = await engine.addTrack("synth", SYNTH_PRESETS[0].name);
    useStore.setState({ selectedTrackId: id });
  };

  return (
    <div className="tracks">
      {tracks.map((t) => (
        <TrackRow key={t.id} t={t} selected={t.id === selectedTrackId} />
      ))}
      <div className="tracks-foot">
        <button className="pal-chip" onClick={add}>+ ADD TRACK</button>
        <label className="loop-len">
          LOOP
          <select
            className="tb-select small"
            value={engine.loopBars}
            onChange={(e) => (engine.loopBars = parseInt(e.target.value, 10))}
          >
            {[2, 4, 8].map((n) => (
              <option key={n} value={n}>{n} BARS</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function TrackRow({ t, selected }: { t: TrackMeta; selected: boolean }) {
  const sourceLabel =
    t.kind === "sampled"
      ? SAMPLED_INSTRUMENTS.find((i) => i.id === t.sourceId)?.label ?? t.sourceId
      : t.sourceId;

  const changeSource = async (v: string) => {
    if (v.startsWith("sampled:")) {
      await engine.setTrackSource(t.id, "sampled", v.slice(8));
    } else {
      await engine.setTrackSource(t.id, "synth", v.slice(6));
    }
  };

  return (
    <div
      className={`track-row ${selected ? "sel" : ""} ${t.armed ? "armed" : ""}`}
      onClick={() => useStore.setState({ selectedTrackId: t.id })}
    >
      <button
        className={`trk-btn arm ${t.armed ? "on" : ""}`}
        title="arm — your hands play this track"
        onClick={(e) => {
          e.stopPropagation();
          engine.updateTrackMeta(t.id, { armed: true });
        }}
      >
        ●
      </button>
      <button
        className={`trk-btn rec ${t.recording ? "live" : t.recPending ? "pend" : ""}`}
        title="loop-record this track"
        onClick={(e) => {
          e.stopPropagation();
          if (t.recording || t.recPending) engine.cancelLoopRecord();
          else engine.requestLoopRecord(t.id);
        }}
      >
        ⦿
      </button>
      <span className="trk-name">{t.name}</span>
      <select
        className="tb-select small"
        value={`${t.kind === "sampled" ? "sampled:" + t.sourceId : "synth:" + t.sourceId}`}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => changeSource(e.target.value)}
      >
        <optgroup label="Instruments">
          {SAMPLED_INSTRUMENTS.map((i) => (
            <option key={i.id} value={`sampled:${i.id}`}>{i.label}</option>
          ))}
        </optgroup>
        <optgroup label="AirSynth">
          {SYNTH_PRESETS.slice(0, 20).map((p) => (
            <option key={p.name} value={`synth:${p.name}`}>{p.name}</option>
          ))}
        </optgroup>
        {t.kind === "sampler" && <option value={`sampler:${t.sourceId}`}>{sourceLabel} (sample)</option>}
      </select>
      {t.loading && <span className="trk-loading">loading…</span>}
      <button
        className={`trk-btn ${t.muted ? "on-amber" : ""}`}
        title="mute"
        onClick={(e) => {
          e.stopPropagation();
          engine.updateTrackMeta(t.id, { muted: !t.muted });
        }}
      >
        M
      </button>
      <button
        className={`trk-btn ${t.soloed ? "on-mint" : ""}`}
        title="solo"
        onClick={(e) => {
          e.stopPropagation();
          engine.updateTrackMeta(t.id, { soloed: !t.soloed });
        }}
      >
        S
      </button>
      <DragKnob
        label="VOL"
        value={t.gain}
        color="coral"
        onChange={(v) => engine.updateTrackMeta(t.id, { gain: v })}
      />
      <DragKnob
        label="PAN"
        value={(t.pan + 1) / 2}
        color="mint"
        onChange={(v) => engine.updateTrackMeta(t.id, { pan: v * 2 - 1 })}
      />
      {t.hasClip ? (
        <button
          className="trk-clip has"
          title="clear recorded loop"
          onClick={(e) => {
            e.stopPropagation();
            engine.clearClip(t.id);
          }}
        >
          LOOP ✕
        </button>
      ) : (
        <span className="trk-clip">—</span>
      )}
      <button
        className="trk-btn del"
        title="delete track"
        onClick={(e) => {
          e.stopPropagation();
          engine.removeTrack(t.id);
        }}
      >
        🗑
      </button>
    </div>
  );
}

/* ---------------------------------- SYNTH ---------------------------------- */

const SHAPES: OscShape[] = ["sine", "triangle", "sawtooth", "square", "fatsawtooth", "fatsquare", "fattriangle"];
const SHAPE_GLYPH: Record<string, string> = {
  sine: "∿", triangle: "⋀", sawtooth: "⩘", square: "⊓",
  fatsawtooth: "⩘⩘", fatsquare: "⊓⊓", fattriangle: "⋀⋀",
};

function SynthTab({ track }: { track: TrackMeta }) {
  const [patch, setPatch] = useState<SynthPatch | null>(engine.getPatch(track.id));
  const [cat, setCat] = useState(PRESET_CATEGORIES[0]);

  useEffect(() => {
    setPatch(engine.getPatch(track.id));
  }, [track.id, track.sourceId, track.kind]);

  if (track.kind !== "synth" || !patch) {
    return (
      <div className="studio-empty">
        <p>this track is playing "{track.sourceId}" — switch it to an AirSynth preset to edit</p>
        <button
          className="pal-chip"
          onClick={async () => {
            await engine.setTrackSource(track.id, "synth", SYNTH_PRESETS[0].name);
            setPatch(engine.getPatch(track.id));
          }}
        >
          LOAD AIRSYNTH →
        </button>
      </div>
    );
  }

  const up = (mut: Partial<SynthPatch>) => {
    const next = { ...patch, ...mut, name: mut.name ?? patch.name } as SynthPatch;
    setPatch(next);
    engine.applyPatch(track.id, next);
  };

  return (
    <div className="synth">
      <div className="synth-presets">
        <div className="preset-cats">
          {PRESET_CATEGORIES.map((c) => (
            <button key={c} className={`pal-chip ${cat === c ? "sel" : ""}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="preset-list">
          {SYNTH_PRESETS.filter((p) => p.category === cat).map((p) => (
            <button
              key={p.name}
              className={`preset ${patch.name === p.name ? "sel" : ""}`}
              onClick={() => up({ ...p })}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="synth-panel">
        <Module title="OSC 1">
          <div className="shape-row">
            {SHAPES.map((s) => (
              <button
                key={s}
                className={`shape ${patch.osc1.shape === s ? "on" : ""}`}
                title={s}
                onClick={() => up({ osc1: { ...patch.osc1, shape: s } })}
              >
                {SHAPE_GLYPH[s]}
              </button>
            ))}
          </div>
          <DragKnob label="OCT" value={(patch.osc1.octave + 2) / 4} color="coral"
            onChange={(v) => up({ osc1: { ...patch.osc1, octave: Math.round(v * 4) - 2 } })} />
          <DragKnob label="SPREAD" value={patch.spread / 80} color="coral"
            onChange={(v) => up({ spread: v * 80 })} />
        </Module>

        <Module title="OSC 2">
          <div className="shape-row">
            {SHAPES.slice(0, 4).map((s) => (
              <button
                key={s}
                className={`shape ${patch.osc2?.shape === s ? "on" : ""}`}
                onClick={() => up({ osc2: { ...(patch.osc2 ?? { octave: 0, detune: 0, level: 0.4 }), shape: s } })}
              >
                {SHAPE_GLYPH[s]}
              </button>
            ))}
            <button className={`shape ${!patch.osc2 ? "on" : ""}`} title="off"
              onClick={() => up({ osc2: null })}>
              ∅
            </button>
          </div>
          <DragKnob label="LEVEL" value={patch.osc2?.level ?? 0} color="coral"
            onChange={(v) => patch.osc2 && up({ osc2: { ...patch.osc2, level: v } })} />
          <DragKnob label="DETUNE" value={((patch.osc2?.detune ?? 0) + 50) / 100} color="coral"
            onChange={(v) => patch.osc2 && up({ osc2: { ...patch.osc2, detune: v * 100 - 50 } })} />
        </Module>

        <Module title="FILTER">
          <div className="shape-row">
            {(["lowpass", "highpass", "bandpass"] as const).map((f) => (
              <button key={f} className={`shape wide ${patch.filter.type === f ? "on" : ""}`}
                onClick={() => up({ filter: { ...patch.filter, type: f } })}>
                {f === "lowpass" ? "LP" : f === "highpass" ? "HP" : "BP"}
              </button>
            ))}
          </div>
          <DragKnob label="CUTOFF" value={Math.sqrt(patch.filter.cutoff / 9000)} color="mint"
            onChange={(v) => up({ filter: { ...patch.filter, cutoff: Math.max(60, v * v * 9000) } })} />
          <DragKnob label="RES" value={patch.filter.q / 8} color="mint"
            onChange={(v) => up({ filter: { ...patch.filter, q: v * 8 } })} />
        </Module>

        <Module title="ENVELOPE">
          <DragKnob label="ATK" value={Math.sqrt(patch.env.attack / 3)} color="amber"
            onChange={(v) => up({ env: { ...patch.env, attack: v * v * 3 } })} />
          <DragKnob label="DEC" value={Math.sqrt(patch.env.decay / 3)} color="amber"
            onChange={(v) => up({ env: { ...patch.env, decay: Math.max(0.05, v * v * 3) } })} />
          <DragKnob label="SUS" value={patch.env.sustain} color="amber"
            onChange={(v) => up({ env: { ...patch.env, sustain: v } })} />
          <DragKnob label="REL" value={Math.sqrt(patch.env.release / 6)} color="amber"
            onChange={(v) => up({ env: { ...patch.env, release: Math.max(0.05, v * v * 6) } })} />
        </Module>

        <Module title="LFO">
          <div className="shape-row">
            {(["cutoff", "pitch", "volume"] as LfoTarget[]).map((tg) => (
              <button key={tg} className={`shape wide ${patch.lfo?.target === tg ? "on" : ""}`}
                onClick={() => up({ lfo: { rate: patch.lfo?.rate ?? 0.5, depth: patch.lfo?.depth ?? 0.3, target: tg } })}>
                {tg.slice(0, 3).toUpperCase()}
              </button>
            ))}
            <button className={`shape ${!patch.lfo ? "on" : ""}`} onClick={() => up({ lfo: null })}>∅</button>
          </div>
          <DragKnob label="RATE" value={Math.sqrt((patch.lfo?.rate ?? 0) / 8)} color="mint"
            onChange={(v) => patch.lfo && up({ lfo: { ...patch.lfo, rate: Math.max(0.05, v * v * 8) } })} />
          <DragKnob label="DEPTH" value={patch.lfo?.depth ?? 0} color="mint"
            onChange={(v) => patch.lfo && up({ lfo: { ...patch.lfo, depth: v } })} />
        </Module>

        <Module title="GLOBAL">
          <DragKnob label="GLIDE" value={patch.glide / 0.3} color="coral"
            onChange={(v) => up({ glide: v * 0.3 })} />
          <DragKnob label="VOL" value={(patch.volume + 24) / 24} color="coral"
            onChange={(v) => up({ volume: v * 24 - 24 })} />
        </Module>
      </div>
    </div>
  );
}

/* ------------------------------------ FX ------------------------------------ */

function FxTab({ track }: { track: TrackMeta }) {
  const [fx, setFx] = useState<FxParams>(engine.getFx(track.id) ?? structuredClone(DEFAULT_FX));

  useEffect(() => {
    setFx(engine.getFx(track.id) ?? structuredClone(DEFAULT_FX));
  }, [track.id]);

  const up = (mut: Partial<FxParams>) => {
    const next = { ...fx, ...mut };
    setFx(next);
    engine.setFx(track.id, next);
  };

  return (
    <div className="synth-panel fx-panel">
      <Module title="CHORUS">
        <DragKnob label="WET" value={fx.chorus.wet} color="mint"
          onChange={(v) => up({ chorus: { ...fx.chorus, wet: v } })} />
        <DragKnob label="DEPTH" value={fx.chorus.depth} color="mint"
          onChange={(v) => up({ chorus: { ...fx.chorus, depth: v } })} />
      </Module>
      <Module title="PITCH">
        <DragKnob label="WET" value={fx.pitch.wet} color="coral"
          onChange={(v) => up({ pitch: { ...fx.pitch, wet: v } })} />
        <DragKnob label="SHIFT" value={(fx.pitch.shift + 12) / 24} color="coral"
          onChange={(v) => up({ pitch: { ...fx.pitch, shift: Math.round(v * 24) - 12 } })} />
      </Module>
      <Module title="DRIVE">
        <DragKnob label="WET" value={fx.drive.wet} color="amber"
          onChange={(v) => up({ drive: { ...fx.drive, wet: v } })} />
        <DragKnob label="AMT" value={fx.drive.amount} color="amber"
          onChange={(v) => up({ drive: { ...fx.drive, amount: v } })} />
      </Module>
      <Module title="DELAY">
        <DragKnob label="WET" value={fx.delay.wet} color="coral"
          onChange={(v) => up({ delay: { ...fx.delay, wet: v } })} />
        <DragKnob label="TIME" value={fx.delay.time} color="coral"
          onChange={(v) => up({ delay: { ...fx.delay, time: Math.max(0.02, v) } })} />
        <DragKnob label="FDBK" value={fx.delay.feedback} color="coral"
          onChange={(v) => up({ delay: { ...fx.delay, feedback: v } })} />
      </Module>
      <Module title="REVERB">
        <DragKnob label="WET" value={fx.reverb.wet} color="mint"
          onChange={(v) => up({ reverb: { ...fx.reverb, wet: v } })} />
        <DragKnob label="SIZE" value={fx.reverb.decay / 10} color="mint"
          onChange={(v) => up({ reverb: { ...fx.reverb, decay: Math.max(0.3, v * 10) } })} />
      </Module>
    </div>
  );
}

/* ---------------------------------- SAMPLER ---------------------------------- */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const midiName = (m: number) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

function SamplerTab({ track }: { track: TrackMeta }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [root, setRoot] = useState(60);
  const [fileName, setFileName] = useState<string | null>(
    track.kind === "sampler" ? track.sourceId : null,
  );

  const onFile = async (f: File) => {
    const ab = await f.arrayBuffer();
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(ab);
    ctx.close();
    setFileName(f.name);
    await engine.setTrackSource(track.id, "sampler", f.name, buf, root);
  };

  return (
    <div className="sampler">
      <p className="sampler-hint">
        bring your own sound — one note in, a whole instrument out. Airloom
        repitches it across the keyboard so your hands can play chords with it.
      </p>
      <div className="sampler-row">
        <button className="pal-chip" onClick={() => fileRef.current?.click()}>
          {fileName ? `♪ ${fileName}` : "CHOOSE AUDIO FILE"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <label className="loop-len">
          ROOT NOTE
          <select
            className="tb-select small"
            value={root}
            onChange={async (e) => {
              const r = parseInt(e.target.value, 10);
              setRoot(r);
              if (fileName) await engine.setTrackSource(track.id, "sampler", fileName, undefined, r);
            }}
          >
            {Array.from({ length: 37 }, (_, i) => 36 + i).map((m) => (
              <option key={m} value={m}>{midiName(m)}</option>
            ))}
          </select>
        </label>
        {fileName && (
          <button className="pal-chip" onClick={() => engine.previewNote(root)}>
            ▶ PREVIEW
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- shared UI --------------------------------- */

function Module({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="module">
      <span className="module-title">{title}</span>
      <div className="module-body">{children}</div>
    </div>
  );
}

/** Drag-to-turn hardware knob (vertical drag, shift = fine). */
export function DragKnob({
  label,
  value,
  color,
  onChange,
}: {
  label: string;
  value: number;
  color: string;
  onChange: (v: number) => void;
}) {
  const start = useRef<{ y: number; v: number } | null>(null);
  const SWEEP = 270;
  const clamped = Math.min(Math.max(value, 0), 1);
  const angle = -SWEEP / 2 + clamped * SWEEP;
  const r = 17;
  const circ = 2 * Math.PI * r;
  const trackLen = (circ * SWEEP) / 360;

  return (
    <div className="dknob-wrap">
      <div
        className={`knob dknob ${color}`}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          start.current = { y: e.clientY, v: clamped };
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const scale = e.shiftKey ? 600 : 160;
          const dv = (start.current.y - e.clientY) / scale;
          onChange(Math.min(Math.max(start.current.v + dv, 0), 1));
        }}
        onPointerUp={() => (start.current = null)}
      >
        <svg viewBox="0 0 44 44">
          <circle className="knob-track" cx="22" cy="22" r={r}
            strokeDasharray={`${trackLen} ${circ}`} transform="rotate(135 22 22)" />
          <circle className="knob-arc" cx="22" cy="22" r={r}
            strokeDasharray={`${trackLen * clamped} ${circ}`} transform="rotate(135 22 22)" />
        </svg>
        <div className="knob-face" style={{ transform: `rotate(${angle}deg)` }}>
          <span className="knob-dot" />
        </div>
      </div>
      <span className="dknob-label">{label}</span>
    </div>
  );
}
