# Product Specification & Architecture Document: "Maestro"
### Gesture-Controlled Accessible Digital Audio Workstation Engine

---

## 1. Executive Summary & Vision
**Maestro** is an accessible, standalone desktop application that transforms a user's physical hand movements into studio-grade musical performances. Designed for aspiring creators, live performers, and non-musicians, it eliminates traditional barriers to entry—such as complex DAW interfaces and strict music theory knowledge—by substituting them with natural, intuitive spatial gestures.

By employing a **Predictive Quantization Framework** alongside Google MediaPipe computer vision, Maestro resolves traditional camera-to-audio latency bottlenecks. Instead of acting as a continuous, unconstrained controller, the system maps hand positions onto pre-selected harmonic grids and rhythm vectors, ensuring the user can never play a "bad note" or slip out of time. The app functions as a standalone system acting as a **Virtual MIDI Controller**, broadcasting low-latency MIDI data seamlessly to any external DAW (Ableton Live, FL Studio, Logic Pro) or internal audio host.

---

## 2. Core Architecture & System Flow
To ensure absolute isolation between the heavy computational loop of computer vision and the mission-critical, low-latency demands of real-time audio generation, the platform utilizes a decoupled execution architecture.

```
+--------------------------------------------------------------------------+
|                              USER CAMERA                                 |
+--------------------------------------------------------------------------+
                                     │
                                     ▼ [640x480 @ 30fps Video Stream]
+--------------------------------------------------------------------------+
|                      MEDIAPIPE GESTURE ENGINE (CV Thread)                |
|  - Complexity: 0 (Lite)                                                  |
|  - Tracks 21 Landmarks (Focus on Palm Centers and Finger Tips)            |
+--------------------------------------------------------------------------+
                                     │
                                     ▼ [Raw Pixel Data Coordinates (X, Y, Z)]
+--------------------------------------------------------------------------+
|                  TRANSLATION & SMOOTHING ENGINE                          |
|  - Exponential Moving Average Filter (Eliminates Jitter)                 |
|  - Velocity Calculation (ΔPos / Δt)                                      |
+--------------------------------------------------------------------------+
                                     │
                                     ▼ [Smoothed Control Data Vectors]
+--------------------------------------------------------------------------+
|                  PREDICTIVE QUANTIZATION SYSTEM                          |
|  - Synchronizes to Master Clock (BPM Engine)                             |
|  - Input Capture Windowing (Snaps upcoming actions to the next grid beat)|
+--------------------------------------------------------------------------+
                                     │
                                     ▼ [Quantized System Commands]
+--------------------------------------------------------------------------+
|                       MIDI / AUDIO UTILITY LAYER                         |
|  - Map Coordinates to User-Selected Scale & Chord Constraints           |
+--------------------------------------------------------------------------+
                   │                                     │
                   ▼ [Internal Audio Engine]             ▼ [Virtual MIDI Port]
+--------------------------------------+   +-------------------------------+
|       BUILT-IN SAMPLER / SYNTH       |   |      EXTERNAL DAW LINK        |
| - PCM Audio Buffer (.wav Playback)   |   | - Sends Notes & CC to         |
| - Simple Polyphonic Synthesizer      |   |   Ableton, FL Studio, etc.    |
+--------------------------------------+   +-------------------------------+
```

---

## 3. The Predictive Latency Mitigation Framework
Hardware-level latency in consumer-grade webcams ($30	ext{ to }60	ext{ ms}$) renders direct reactive triggering impossible for real-time rhythm. Maestro solves this via an internal musical grid alignment algorithm:

1. **The Grid Window:** The engine hosts a rigid, internal temporal clock bound to the user-defined BPM. 
2. **Pre-Beat Capture:** The system establishes a window exactly $80	ext{ ms}$ prior to every scheduled musical subdivision (Quarter, Eighth, or Sixteenth notes). 
3. **Intent Extraction:** If an aggressive downward velocity change ($\Delta Y$) or gesture crossing occurs inside this window, the engine tags it instantly as an intentional strike for the *upcoming* beat.
4. **Perfect Output Alignment:** The corresponding MIDI Note On or Trigger message is fired exactly at $t=0$ of that upcoming beat. This converts camera lag from a system limitation into a predictive buffer, delivering perfect musical sync.

---

## 4. MVP Feature Set & Scope

### 4.1. Visual Tracking & Processing Pipeline
* **MediaPipe Integration:** Optimized implementation using the `model_complexity = 0` configuration to maximize frame rate processing and minimize thermal throttling.
* **Webcam Scaling:** Hardcoded resolution capture at $640 	imes 480$ pixels to preserve system resources.
* **Data Smoothing Module:** Implementation of an Exponential Moving Average (EMA) mathematical filter over coordinate streams:
    $$	ext{Position}_{	ext{Filtered}} = (lpha 	imes 	ext{Position}_{	ext{Raw}}) + ((1 - lpha) 	imes 	ext{Position}_{	ext{Previous}})$$
    *Target $lpha$ value parameter: 0.15 to 0.25 to eliminate fine coordinate jitter without inflating visual lag.*

### 4.2. Smart Harmonic Constraint Engine
* **Zero-Theory Scale Locks:** Interface options allowing users to lock global performance settings to predefined, mood-labeled frameworks (e.g., "Chill" $ightarrow$ C Major Pentatonic, "Moody" $ightarrow$ A Natural Minor).
* **Pre-Configured Chord Progressions:** A matrix selector allowing the application to loop classic four-chord pop or electronic structures automatically, shifting structural harmony responsibilities off the user.

### 4.3. Dual-Hand Gesture Mapping Profile

#### Left Hand (The Conductor & Dynamic Controller)
* **Vertical Plane (Y-Axis):** Controls continuous harmonic complexity and arrangement thickness.
    * *Low Area:* Single root bass note transmission.
    * *Mid Area:* Standard triad chord configurations.
    * *High Area:* Advanced extensions (Add9, Major 7th, Minor 9th chords).
* **Hand Envelope State (Fist vs. Open Palm):** Maps directly to system envelope characteristics. A closed fist initiates an absolute MIDI Dampen/Mute command; opening the hand sweeps internal engine parameters to let sounds ring out naturally.

#### Right Hand (The Performer & Rhythmic Driver)
* **Horizontal Plane (X-Axis):** Divided into explicit visual columns mapped directly to specific instrumental triggers.
    * *Left Third Grid:* Arpeggiator engine lane.
    * *Center Third Grid:* Direct chord pad trigger lane.
    * *Right Third Grid:* Layered percussion and sample array lane.
* **Velocity Strike Engine:** Real-time tracking of rapid downward hand movements. When the scalar value of $-\Delta Y/\Delta t$ crosses a preset user threshold, it calculates a proportional MIDI Velocity value ($1	ext{ to }127$), making air-drumming and string-strumming highly dynamic.

### 4.4. Audio Hosting & Outer Connectivity
* **Virtual MIDI Interface Support:** Native implementation utilizing virtual MIDI loopback libraries (such as `RtMidi` for C++ platforms or `mido`/`python-rtmidi` for Python targets). This allows the application to appear inside Ableton Live, FL Studio, Logic, or Pro Tools as a hardware-level MIDI controller.
* **Basic Built-In Sound Module:** A lightweight internal synthesizer implementation along with an audio sample player module designed to read short linear PCM audio files (`.wav`), giving the user immediate auditory feedback without configuring an external DAW.

---

## 5. Next Steps for Implementation
To begin development on the MVP prototype, the next engineering agent should proceed in this order:
1. Initialize a standalone project setup using the selected environment pipeline.
2. Build the MediaPipe vision loop capture using a standard webcam feed capped at $640 	imes 480$ resolution.
3. Write the EMA signal filter block to decouple coordinate reading from hand jitter.
4. Integrate a basic MIDI virtual output loopback system and route a mapped X/Y boundary system out to a diagnostic synthesizer patch.
5. Code the internal master clock and the predictive grid system to evaluate timing accuracy.