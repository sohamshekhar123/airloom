import { useCallback, useEffect, useState } from "react";
import { Stage } from "./components/Stage";
import { initTracker } from "./vision/tracker";
import { engine, INSTRUMENTS } from "./audio/engine";
import { PROGRESSIONS } from "./music/progressions";
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
      <div className="welcome-glow" aria-hidden />
      <p className="welcome-eyebrow">no instrument · no theory · no DAW</p>
      <h1 className="welcome-title">
        AIR<span>LOOM</span>
      </h1>
      <p className="welcome-tag">
        Wave your hands, weave a song. Your right hand plays and shapes the
        sound, your left hand colors it — and it's impossible to hit a wrong
        note.
      </p>

      <div className="welcome-hands">
        <div className="hand-card coral">
          <span className="hand-card-side">RIGHT HAND</span>
          <span className="hand-card-role">The Performer</span>
          <span className="hand-card-desc">
            open = louder · left↔right = rhythm · up = vibrato · push = next chord
          </span>
        </div>
        <div className="hand-card mint">
          <span className="hand-card-side">LEFT HAND</span>
          <span className="hand-card-role">The Conductor</span>
          <span className="hand-card-desc">
            raise = richer chords · pinch + raise = set intensity
          </span>
        </div>
      </div>

      {screen === "error" && <p className="welcome-error">{errorMessage}</p>}

      <button className="begin-btn" onClick={begin} disabled={screen === "loading"}>
        {screen === "loading" ? "warming up the loom…" : "▶ start weaving"}
      </button>
      <p className="welcome-fineprint">
        needs your camera · nothing is recorded or uploaded
      </p>
    </div>
  );
}

/* -------------------------------- Performance -------------------------------- */

function PerformanceScreen() {
  const stream = (window as unknown as { __airloomStream: MediaStream }).__airloomStream;
  return (
    <div className="perf">
      <Stage stream={stream} />
      <TopBar />
      <ChordDisplay />
    </div>
  );
}

function ChordDisplay() {
  const chordName = useStore((s) => s.chordName);
  const setChord = useStore((s) => s.setChord);

  useEffect(() => {
    engine.onChord = (name, step) => setChord(name, step);
    engine.onChord?.(
      PROGRESSIONS.find((p) => p.id === useStore.getState().progressionId)!.chords[0].name,
      0,
    );
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

/** Logic-style status bar: every hand control, its live value, and whether
 *  the hand driving it is currently tracked. */
function TopBar() {
  const s = useStore();
  const [loadingInst, setLoadingInst] = useState(false);

  const progression = PROGRESSIONS.find((p) => p.id === s.progressionId)!;

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

  const pickProgression = (id: string) => {
    const p = PROGRESSIONS.find((x) => x.id === id)!;
    useStore.setState({ progressionId: id });
    engine.setProgression(p);
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
      </div>

      <div className="tb-lcd">
        <Cell label={progression.label} on wide>
          <div className="chord-steps">
            {progression.chords.map((c, i) => (
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
          <span className="cell-value mint">
            {["BASS", "CHORD", "LUSH"][s.voicing]}
          </span>
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
        <select
          className="tb-select"
          value={s.progressionId}
          onChange={(e) => pickProgression(e.target.value)}
          title={progression.vibe}
        >
          {PROGRESSIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
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
