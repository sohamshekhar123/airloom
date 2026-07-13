import { useCallback, useEffect, useRef, useState } from "react";
import { Stage } from "./components/Stage";
import { initTracker } from "./vision/tracker";
import { engine, INSTRUMENTS } from "./audio/engine";
import {
  CHORD_PALETTE,
  PROGRESSIONS,
  chordFromNotes,
  type Chord,
} from "./music/progressions";
import { RATE_LABELS } from "./gestures/interpreter";
import { useStore } from "./state/store";

export default function App() {
  const screen = useStore((s) => s.screen);
  return screen === "stage" ? <PerformanceScreen /> : <WelcomeScreen />;
}

/* ---------------------------------- Welcome ---------------------------------- */

function WelcomeScreen() {
  const { screen, errorMessage, setScreen } = useStore();

  const begin = useCallback(async () => {
    setScreen("loading");
    try {
      const [stream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, frameRate: { ideal: 60, min: 24 } },
          audio: false,
        }),
        engine.start("piano"),
        initTracker(),
      ]);
      (window as unknown as { __airloomStream: MediaStream }).__airloomStream = stream;
      engine.play(useStore.getState().bpm);
      useStore.setState({ screen: "stage", playing: true });
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera access was blocked. Airloom needs to see your hands — enable the camera and try again."
          : `Couldn't start: ${err instanceof Error ? err.message : String(err)}`;
      setScreen("error", msg);
    }
  }, [setScreen]);

  return (
    <div className="welcome">
      <header className="w-rail">
        <span>AIRLOOM</span>
        <span>INSTRUMENT Nº 001</span>
        <span>CAMERA-WOVEN MUSIC</span>
        <span className="w-rail-dot" aria-hidden>
          ●
        </span>
      </header>

      <main className="w-main">
        <div className="w-hero">
          <h1 className="w-title">
            <span className="w-title-outline">AIR</span>
            <span className="w-title-solid">
              LOOM<i className="w-title-mark" />
            </span>
          </h1>
          <p className="w-tag">
            An instrument you play with bare hands. No theory, no hardware,
            no wrong notes — the loom keeps every thread in tune.
          </p>

          {screen === "error" && <p className="welcome-error">{errorMessage}</p>}

          <button className="begin-btn" onClick={begin} disabled={screen === "loading"}>
            {screen === "loading" ? "WARMING UP THE LOOM…" : "BEGIN WEAVING"}
            <span className="begin-arrow">→</span>
          </button>
          <p className="w-fineprint">
            requires a camera — all tracking runs locally, nothing is recorded
            or uploaded
          </p>
        </div>

        <aside className="w-manual">
          <div className="w-step coral">
            <span className="w-step-no">01</span>
            <div>
              <h3>The Performer — right hand</h3>
              <ul>
                <li>open your hand — volume</li>
                <li>glide left ↔ right — rhythm, held to rapid</li>
                <li>raise — vibrato</li>
                <li>pinch — next chord</li>
              </ul>
            </div>
          </div>
          <div className="w-step mint">
            <span className="w-step-no">02</span>
            <div>
              <h3>The Conductor — left hand</h3>
              <ul>
                <li>raise — richer, lusher chords</li>
                <li>pinch + raise — set intensity, stays when released</li>
              </ul>
            </div>
          </div>
          <div className="w-step amber">
            <span className="w-step-no">03</span>
            <div>
              <h3>The Loom — your chords</h3>
              <ul>
                <li>mix &amp; match preset chords, or</li>
                <li>click notes on the keys, like a piano roll</li>
              </ul>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

/* -------------------------------- Performance -------------------------------- */

function PerformanceScreen() {
  const stream = (window as unknown as { __airloomStream: MediaStream }).__airloomStream;
  const loomOpen = useStore((s) => s.loomOpen);
  return (
    <div className="perf">
      <Stage stream={stream} />
      <TopBar />
      <ChordDisplay />
      {loomOpen && <Loom />}
    </div>
  );
}

function ChordDisplay() {
  const chordName = useStore((s) => s.chordName);
  const setChord = useStore((s) => s.setChord);

  useEffect(() => {
    engine.onChord = (name, step) => setChord(name, step);
    const s = useStore.getState();
    setChord(s.chords[0].name, 0);
    return () => {
      engine.onChord = null;
    };
  }, [setChord]);

  return (
    <div className="perf-chord" key={chordName}>
      {chordName && <span>{chordName}</span>}
    </div>
  );
}

/* ---------------------------------- Top bar ---------------------------------- */

function TopBar() {
  const s = useStore();
  const [loadingInst, setLoadingInst] = useState(false);

  const togglePlay = () => {
    if (s.playing) {
      engine.pause();
      useStore.setState({ playing: false });
    } else {
      engine.play(s.bpm);
      useStore.setState({ playing: true });
    }
  };

  const changeBpm = (delta: number) => {
    const bpm = Math.min(Math.max(s.bpm + delta, 50), 180);
    useStore.setState({ bpm });
    engine.setBpm(bpm);
  };

  const loadPreset = (label: string) => {
    const p = PROGRESSIONS.find((x) => x.label === label);
    if (!p) return;
    useStore.setState({
      progressionLabel: p.label,
      chords: p.chords,
      selectedSlot: 0,
    });
    engine.setChords(p.chords, true);
  };

  const pickInstrument = async (id: string) => {
    useStore.setState({ instrumentId: id });
    setLoadingInst(true);
    try {
      await engine.setInstrument(id);
    } finally {
      setLoadingInst(false);
    }
  };

  return (
    <header className="topbar">
      <div className="tb-left">
        <span className="tb-logo">AIRLOOM</span>
        <button className={`tb-play ${s.playing ? "on" : ""}`} onClick={togglePlay}>
          {s.playing ? "❚❚" : "▶"}
        </button>
        <RecordButton />
      </div>

      <div className="tb-lcd">
        <Cell label={s.progressionLabel.toUpperCase()} on wide>
          <div className="chord-steps">
            {s.chords.map((c, i) => (
              <span key={i} className={`chord-step ${i === s.chordStep ? "now" : ""}`}>
                {c.name}
              </span>
            ))}
          </div>
        </Cell>

        <Cell label="VOLUME" on={s.rightOn}>
          <Meter value={s.volume} color="coral" />
        </Cell>
        <Cell label="RHYTHM" on={s.rightOn}>
          <span className="cell-value">{RATE_LABELS[s.rate]}</span>
        </Cell>
        <Cell label="VIBRATO" on={s.rightOn}>
          <Meter value={s.vibrato} color="coral" />
        </Cell>
        <Cell label="RICHNESS" on={s.leftOn}>
          <span className="cell-value mint">{["BASS", "CHORD", "LUSH"][s.voicing]}</span>
        </Cell>
        <Cell label={s.pinching ? "VELOCITY ●" : "VELOCITY"} on={s.leftOn} hot={s.pinching}>
          <Meter value={s.velocity} color={s.pinching ? "amber" : "mint"} />
        </Cell>
        <Cell label="TEMPO" on>
          <div className="bpm-ctl">
            <button onClick={() => changeBpm(-4)}>−</button>
            <span className="cell-value">{s.bpm}</span>
            <button onClick={() => changeBpm(4)}>+</button>
          </div>
        </Cell>
      </div>

      <div className="tb-right">
        <button
          className={`tb-loom-btn ${s.loomOpen ? "on" : ""}`}
          onClick={() => {
            const open = !s.loomOpen;
            useStore.setState({ loomOpen: open });
            engine.setEditorMode(open);
          }}
        >
          THE LOOM
        </button>
        <select
          className="tb-select"
          value={s.progressionLabel}
          onChange={(e) => loadPreset(e.target.value)}
        >
          {PROGRESSIONS.map((p) => (
            <option key={p.id} value={p.label}>
              {p.label}
            </option>
          ))}
          {!PROGRESSIONS.some((p) => p.label === s.progressionLabel) && (
            <option value={s.progressionLabel}>{s.progressionLabel}</option>
          )}
        </select>
        <select
          className="tb-select"
          value={s.instrumentId}
          onChange={(e) => pickInstrument(e.target.value)}
        >
          {INSTRUMENTS.map((i) => (
            <option key={i.id} value={i.id}>
              {loadingInst && i.id === s.instrumentId ? "loading…" : i.label}
            </option>
          ))}
        </select>
        <span
          className={`status-dot ${s.quality > 0.6 ? "good" : s.quality > 0 ? "ok" : "bad"}`}
          title="hand tracking quality"
        />
      </div>
    </header>
  );
}

function RecordButton() {
  const recording = useStore((s) => s.recording);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<number>(0);

  const toggle = async () => {
    if (!recording) {
      engine.startRecording();
      useStore.setState({ recording: true });
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      window.clearInterval(timerRef.current);
      useStore.setState({ recording: false });
      const blob = await engine.stopRecording();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      a.href = url;
      a.download = `airloom-take-${stamp}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const mm = String(Math.floor(elapsed / 60));
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <button className={`tb-rec ${recording ? "on" : ""}`} onClick={toggle}
      title={recording ? "stop & save recording" : "record audio"}>
      <span className="rec-dot" />
      {recording ? `${mm}:${ss}` : "REC"}
    </button>
  );
}

/* ----------------------------- The Loom (editor) ----------------------------- */

function Loom() {
  const { chords, selectedSlot } = useStore();
  const selected = chords[selectedSlot];

  const commit = (next: Chord[], slot = selectedSlot) => {
    useStore.setState({ chords: next, selectedSlot: slot, progressionLabel: "My Weave" });
    engine.setChords(next);
  };

  const setSlotChord = (c: Chord) => {
    const next = chords.map((x, i) => (i === selectedSlot ? c : x));
    commit(next);
  };

  const addSlot = () => {
    if (chords.length >= 8) return;
    commit([...chords, chords[chords.length - 1]], chords.length);
  };

  const removeSlot = (i: number) => {
    if (chords.length <= 2) return;
    const next = chords.filter((_, j) => j !== i);
    commit(next, Math.min(selectedSlot, next.length - 1));
  };

  const toggleNote = (midi: number) => {
    engine.previewNote(midi);
    const has = selected.notes.triad.includes(midi);
    const notes = has
      ? selected.notes.triad.filter((n) => n !== midi)
      : [...selected.notes.triad, midi];
    const c = chordFromNotes(notes);
    if (c) setSlotChord(c);
  };

  const close = () => {
    useStore.setState({ loomOpen: false });
    engine.setEditorMode(false);
  };

  return (
    <section className="loom">
      <header className="loom-head">
        <h2>THE LOOM</h2>
        <p>pick a slot, then swap in a preset chord — or click keys to weave your own</p>
        <button className="loom-close" onClick={close}>
          ✕
        </button>
      </header>

      <div className="loom-slots">
        {chords.map((c, i) => (
          <div key={i} className={`slot ${i === selectedSlot ? "sel" : ""}`}>
            <button className="slot-chip" onClick={() => useStore.setState({ selectedSlot: i })}>
              <span className="slot-no">{i + 1}</span>
              <span className="slot-name">{c.name}</span>
            </button>
            {chords.length > 2 && (
              <button className="slot-x" onClick={() => removeSlot(i)}>
                ✕
              </button>
            )}
          </div>
        ))}
        {chords.length < 8 && (
          <button className="slot-add" onClick={addSlot}>
            +
          </button>
        )}
      </div>

      <div className="loom-palette">
        {CHORD_PALETTE.map((c) => (
          <button
            key={c.name}
            className={`pal-chip ${selected.name === c.name ? "sel" : ""}`}
            onClick={() => setSlotChord(c)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <Piano active={selected.notes.triad} onToggle={toggleNote} />
    </section>
  );
}

/** Two octaves, C3..C5, Logic-style clickable keys. */
function Piano({ active, onToggle }: { active: number[]; onToggle: (m: number) => void }) {
  const whites: number[] = [];
  for (const o of [0, 1]) for (const s of [0, 2, 4, 5, 7, 9, 11]) whites.push(48 + o * 12 + s);
  whites.push(72);
  // black key after white indices 0,1,3,4,5 within each octave
  const blacks: { midi: number; after: number }[] = [];
  [0, 1].forEach((o) => {
    const base = o * 7;
    [[0, 1], [1, 3], [3, 6], [4, 8], [5, 10]].forEach(([wi, s]) => {
      blacks.push({ midi: 48 + o * 12 + s, after: base + wi });
    });
  });
  const ww = 100 / whites.length;

  return (
    <div className="piano">
      {whites.map((m) => (
        <button
          key={m}
          className={`pkey white ${active.includes(m) ? "on" : ""}`}
          style={{ width: `${ww}%` }}
          onClick={() => onToggle(m)}
        />
      ))}
      {blacks.map(({ midi, after }) => (
        <button
          key={midi}
          className={`pkey black ${active.includes(midi) ? "on" : ""}`}
          style={{ left: `${(after + 1) * ww - ww * 0.3}%`, width: `${ww * 0.6}%` }}
          onClick={() => onToggle(midi)}
        />
      ))}
    </div>
  );
}

/* --------------------------------- primitives --------------------------------- */

function Cell({
  label,
  on,
  hot,
  wide,
  children,
}: {
  label: string;
  on: boolean;
  hot?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`lcd-cell ${on ? "on" : "off"} ${hot ? "hot" : ""} ${wide ? "wide" : ""}`}>
      <span className="cell-label">{label}</span>
      {children}
    </div>
  );
}

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <div className="meter">
      <div className={`meter-fill ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}
