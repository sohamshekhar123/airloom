# 🧵 Airloom

**Wave your hands, weave a song.**

Airloom is a camera-powered instrument for people who've never opened a DAW, never touched a piano, and don't know what a "minor seventh" is — but still want to make music that sounds *good*. No hardware, no installs, no theory. Just a webcam and your hands.

> *air + loom — you weave loops of music out of thin air.*

## How you play

| | |
|---|---|
| 🫱 **Right hand — The Performer** | **Open your hand** to raise the volume (fist = silence). Move **side to side** to set the rhythm — from long held chords to sparkling 16th-note runs. Move **up** for vibrato. **Push toward the camera** to advance to the next chord, like pressing an invisible button. |
| 🫲 **Left hand — The Conductor** | **Raise it** for richer, lusher chords; lower it for deep bass. **Pinch** (thumb + index) and raise/lower to dial in note intensity — the value latches when you let go. |
| 🎼 **Progressions, not theory** | Pick *Anthem*, *Heartache*, *Velvet*, *Daydream*, or *Shadow*. Airloom locks everything to voicings that always work — **you cannot play a wrong note.** |
| 🎹 **Real instruments** | Sampled grand piano, acoustic guitar, and violin (plus a dreamy synth), switchable live from the top bar. |

## Why it doesn't feel laggy (the interesting part)

Webcams are slow (30–60ms behind reality) — normally fatal for a musical instrument. Airloom sidesteps this with **commit-ahead scheduling**:

1. The master clock is the **audio hardware clock** (`AudioContext` time), never a JS timer.
2. When a strike is detected, it isn't played immediately — it's scheduled **sample-accurately at the next 16th-note grid slot**.
3. Continuous controls (chord richness, brightness) only drive **slow-attack sounds** (pads, filters), where latency is inaudible by design.
4. Jitter is tamed with a **One Euro filter** — adaptive smoothing that's calm at rest and instant during fast moves.

Camera lag becomes musically invisible: every hit *lands* on the beat.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, allow camera access, pick a mood, press play, and start weaving. Chrome/Edge recommended (GPU-accelerated hand tracking). Nothing is recorded or uploaded — all vision runs locally in your browser.

## Architecture

```
Webcam ─► MediaPipe HandLandmarker (GPU, VIDEO mode)
              │ 21 landmarks/hand, mirrored to match on-screen view
              ▼
   Gesture Interpreter ──┬─ continuous path: One Euro filter → voicing/brightness
                         └─ trigger path: 3-frame velocity + Schmitt trigger → strikes
              ▼
   Harmonic Constraint Engine (mood → scale + progression, wrong notes impossible)
              ▼
   Tone.js audio engine — Transport master clock, commit-ahead strike scheduling
```

- **Stack:** Vite · React 19 · TypeScript · Zustand · MediaPipe Tasks Vision · Tone.js
- High-frequency data (landmarks @60Hz) never touches React — it flows ref→canvas→audio. React only re-renders on slow, discrete state.

## Roadmap

- [ ] **Loop recording & layering** — perform 4 bars, loop it, weave the next layer on top
- [ ] **Drums / percussion layer** — bring back strike-to-drum as an optional second mode
- [ ] **Latency calibration** — air-tap test measures your camera+audio offset per device
- [ ] **WebMIDI out** — use Airloom as a controller for Ableton / FL / Logic
- [ ] **Tauri desktop app** — native virtual MIDI port, installable
- [ ] Pre-beat intent prediction (experimental)
- [ ] More moods, more instruments, sample packs

See [maestro_idea_specification.md](maestro_idea_specification.md) for the original concept document.

## License

MIT
