/**
 * The Stage: full-bleed mirrored camera + canvas overlay.
 * The render loop (requestVideoFrameCallback) drives vision -> gestures ->
 * audio directly, without touching React. React only gets slow UI updates.
 */
import { useEffect, useRef } from "react";
import { detectHands, HAND_CONNECTIONS, type TrackedHand } from "../vision/tracker";
import { GestureInterpreter, HARMONY_ZONE_MAX_X, laneForX } from "../gestures/interpreter";
import { engine } from "../audio/engine";
import { useStore } from "../state/store";

const HARMONY_COLOR = "#3ef0b6";
const RHYTHM_COLOR = "#ff5c38";
const LANE_LABELS: Record<string, string> = {
  arp: "SPARKLE",
  chord: "CHORDS",
  drum: "DRUMS",
};

interface FlashState {
  lane: string;
  at: number;
}

export function Stage({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setPerformance = useStore((s) => s.setPerformance);

  useEffect(() => {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    video.srcObject = stream;
    video.play().catch(() => {});

    const interpreter = new GestureInterpreter();
    const flash: FlashState = { lane: "", at: 0 };
    let rafHandle = 0;
    let disposed = false;

    const loop = () => {
      if (disposed) return;
      const now = performance.now();
      const hands = detectHands(video, now);
      const frame = interpreter.update(hands, now);

      // ---- musical intent -> audio engine ----
      if (frame.harmony) {
        engine.setHarmony(frame.harmony.voicing, frame.harmony.height);
        engine.setMuted(frame.harmony.fist);
      }
      if (frame.strike) {
        engine.strike(frame.strike.lane, frame.strike.velocity);
        flash.lane = frame.strike.lane;
        flash.at = now;
      }

      // ---- slow UI state ----
      setPerformance({
        hoverLane: frame.hoverLane,
        voicing: frame.harmony?.voicing ?? 1,
        muted: frame.harmony?.fist ?? false,
        quality: frame.quality,
      });

      draw(ctx, canvas, hands, frame.hoverLane, flash, now);
      rafHandle = video.requestVideoFrameCallback(loop);
    };

    const onReady = () => {
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      loop();
    };
    if (video.readyState >= 2) onReady();
    else video.addEventListener("loadeddata", onReady, { once: true });

    return () => {
      disposed = true;
      if (rafHandle) video.cancelVideoFrameCallback(rafHandle);
    };
  }, [stream, setPerformance]);

  return (
    <div className="stage">
      <video ref={videoRef} className="stage-video" playsInline muted />
      <canvas ref={canvasRef} className="stage-canvas" />
    </div>
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  hands: TrackedHand[],
  hoverLane: string | null,
  flash: FlashState,
  now: number,
) {
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);

  // ---- zone guides ----
  const hx = HARMONY_ZONE_MAX_X * w;
  // harmony zone: subtle mint wash + 3 height bands
  ctx.fillStyle = "rgba(62, 240, 182, 0.05)";
  ctx.fillRect(0, 0, hx, h);
  ctx.strokeStyle = "rgba(62, 240, 182, 0.25)";
  ctx.setLineDash([6, 8]);
  ctx.lineWidth = 1;
  for (const frac of [1 / 3, 2 / 3]) {
    ctx.beginPath();
    ctx.moveTo(0, h * frac);
    ctx.lineTo(hx, h * frac);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // trigger lanes
  const laneW = (w - hx) / 3;
  const lanes = ["arp", "chord", "drum"] as const;
  lanes.forEach((lane, i) => {
    const x0 = hx + i * laneW;
    const isHover = hoverLane === lane;
    const flashAge = now - flash.at;
    const isFlash = flash.lane === lane && flashAge < 220;
    if (isFlash) {
      const a = 0.35 * (1 - flashAge / 220);
      ctx.fillStyle = `rgba(255, 92, 56, ${a})`;
      ctx.fillRect(x0, 0, laneW, h);
    } else if (isHover) {
      ctx.fillStyle = "rgba(255, 92, 56, 0.06)";
      ctx.fillRect(x0, 0, laneW, h);
    }
    ctx.strokeStyle = "rgba(255, 92, 56, 0.2)";
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, h);
    ctx.stroke();

    ctx.font = "600 13px 'Instrument Sans', sans-serif";
    ctx.fillStyle = isHover
      ? "rgba(255, 92, 56, 0.9)"
      : "rgba(244, 239, 233, 0.35)";
    ctx.textAlign = "center";
    ctx.letterSpacing = "3px";
    ctx.fillText(LANE_LABELS[lane], x0 + laneW / 2, h - 24);
  });

  // ---- hand skeletons ----
  for (const hand of hands) {
    const color = hand.side === "left" ? HARMONY_COLOR : RHYTHM_COLOR;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    for (const [a, b] of HAND_CONNECTIONS) {
      const p = hand.landmarks[a];
      const q = hand.landmarks[b];
      ctx.beginPath();
      ctx.moveTo(p.x * w, p.y * h);
      ctx.lineTo(q.x * w, q.y * h);
      ctx.stroke();
    }
    for (const lm of hand.landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
}

export { laneForX };
