import { useCallback, useEffect, useRef, useState } from "react";
import { Stage } from "./components/Stage";
import { initTracker } from "./vision/tracker";
import { engine } from "./audio/engine";
import { MOODS, type Mood } from "./music/moods";
import { useStore } from "./state/store";

export default function App() {
  const screen = useStore((s) => s.screen);
  return screen === "stage" ? <PerformanceScreen /> : <WelcomeScreen />;
}

/* ---------------------------------- Welcome ---------------------------------- */

function WelcomeScreen() {
  const { screen, errorMessage, setScreen } = useStore();
  const [streamHolder] = useState<{ stream: MediaStream | null }>({ stream: null });

  const begin = useCallback(async () => {
    setScreen("loading");
    try {
      // Audio must resume inside the user gesture; camera + model load in parallel
      const [stream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, frameRate: { ideal: 60, min: 24 } },
          audio: false,
        }),
        engine.start(),
        initTracker(),
      ]);
      streamHolder.stream = stream;
      useStore.setState({ screen: "stage" });
      (window as unknown as { __airloomStream: MediaStream }).__airloomStream = stream;
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera access was blocked. Airloom needs to see your hands — enable the camera and try again."
          : `Couldn't start: ${err instanceof Error ? err.message : String(err)}`;
      setScreen("error", msg);
    }
  }, [setScreen, streamHolder]);

  return (
    <div className="welcome">
      <div className="welcome-glow" aria-hidden />
      <p className="welcome-eyebrow">no instrument · no theory · no DAW</p>
      <h1 className="welcome-title">
        AIR<span>LOOM</span>
      </h1>
      <p className="welcome-tag">
        Wave your hands, weave a song. Your left hand shapes the harmony, your
        right hand plays the beat — and it's impossible to hit a wrong note.
      </p>

      <div className="welcome-hands">
        <div className="hand-card mint">
          <span className="hand-card-side">LEFT HAND</span>
          <span className="hand-card-role">The Conductor</span>
          <span className="hand-card-desc">raise = richer chords · fist = hush</span>
        </div>
        <div className="hand-card coral">
          <span className="hand-card-side">RIGHT HAND</span>
          <span className="hand-card-role">The Performer</span>
          <span className="hand-card-desc">strike down = play · always in time</span>
        </div>
      </div>

      {screen === "error" && <p className="welcome-error">{errorMessage}</p>}

      <button
        className="begin-btn"
        onClick={begin}
        disabled={screen === "loading"}
      >
        {screen === "loading" ? "warming up the loom…" : "▶ start weaving"}
      </button>
      <p className="welcome-fineprint">needs your camera · nothing is recorded or uploaded</p>
    </div>
  );
}

/* -------------------------------- Performance -------------------------------- */

function PerformanceScreen() {
  const { mood, playing, chordName, beat, muted, voicing, quality, setMood, setPlaying, setChord, setBeat } =
    useStore();
  const stream = (window as unknown as { __airloomStream: MediaStream }).__airloomStream;
  const beatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    engine.onChord = (name) => setChord(name);
    engine.onBeat = (b) => {
      setBeat(b);
      // retrigger pulse animation
      const el = beatRef.current;
      if (el) {
        el.classList.remove("pulse");
        void el.offsetWidth;
        el.classList.add("pulse");
      }
    };
    return () => {
      engine.onChord = null;
      engine.onBeat = null;
    };
  }, [setChord, setBeat]);

  const togglePlay = async () => {
    if (playing) {
      engine.stop();
      await engine.start(); // re-arm schedules for next play
      setPlaying(false);
      setChord("");
    } else {
      engine.play();
      setPlaying(true);
    }
  };

  const pickMood = (m: Mood) => {
    setMood(m);
    engine.setMood(m);
  };

  const voicingLabel = ["bass", "chords", "lush"][voicing] ?? "chords";

  return (
    <div className="perf" style={{ "--mood": mood.color } as React.CSSProperties}>
      <Stage stream={stream} />

      <header className="perf-top">
        <span className="perf-logo">AIRLOOM</span>
        <div className="perf-status">
          {muted && <span className="status-muted">✊ hushed</span>}
          <span className="status-voicing">{voicingLabel}</span>
          <span
            className={`status-dot ${quality > 0.6 ? "good" : quality > 0 ? "ok" : "bad"}`}
            title="hand tracking quality"
          />
        </div>
      </header>

      <div className="perf-chord" key={chordName}>
        {playing && chordName && <span>{chordName}</span>}
      </div>

      <footer className="perf-bar">
        <button className={`play-btn ${playing ? "on" : ""}`} onClick={togglePlay}>
          {playing ? "◼" : "▶"}
        </button>

        <div ref={beatRef} className="beat-ring">
          <span>{playing ? beat + 1 : "·"}</span>
        </div>

        <div className="moods">
          {MOODS.map((m) => (
            <button
              key={m.id}
              className={`mood-chip ${mood.id === m.id ? "active" : ""}`}
              style={{ "--chip": m.color } as React.CSSProperties}
              onClick={() => pickMood(m)}
            >
              <span className="mood-emoji">{m.emoji}</span>
              <span className="mood-label">{m.label}</span>
              <span className="mood-tagline">{m.tagline}</span>
            </button>
          ))}
        </div>

        <div className="bpm">
          <span className="bpm-num">{mood.bpm}</span>
          <span className="bpm-label">BPM</span>
        </div>
      </footer>
    </div>
  );
}
