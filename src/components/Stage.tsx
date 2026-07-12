/**
 * The Stage: full-bleed mirrored camera + canvas HUD.
 * The render loop (requestVideoFrameCallback) drives vision -> gestures ->
 * audio directly, without touching React. React only gets slow UI updates.
 */
import { useEffect, useRef } from "react";
import { detectHands, HAND_CONNECTIONS, type TrackedHand } from "../vision/tracker";
import {
  GestureInterpreter,
  HARMONY_ZONE_MAX_X,
  RATE_LABELS,
  type GestureFrame,
} from "../gestures/interpreter";
import { engine } from "../audio/engine";
import { useStore } from "../state/store";

const MINT = "#3ef0b6";
const CORAL = "#ff5c38";
const AMBER = "#ffb02e";

export function Stage({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setPerf = useStore((s) => s.setPerf);

  useEffect(() => {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    video.srcObject = stream;
    video.play().catch(() => {});

    const interpreter = new GestureInterpreter();
    const ripple = { at: -1e9, x: 0, y: 0 };
    let rafHandle = 0;
    let disposed = false;

    const loop = () => {
      if (disposed) return;
      const now = performance.now();
      const hands = detectHands(video, now);
      const frame = interpreter.update(hands, now);

      // ---- hands -> audio engine ----
      if (frame.right) {
        engine.setExpression(frame.right.openness, frame.right.rateIndex, frame.right.vibrato);
        if (frame.right.pushed) {
          engine.advanceChord();
          ripple.at = now;
          ripple.x = frame.right.x;
          ripple.y = frame.right.y;
        }
      } else {
        engine.setExpression(0, 2, 0);
      }
      if (frame.left) {
        engine.setVoicing(frame.left.voicing);
        engine.setVelocity(frame.left.velocity);
      }

      // ---- slow UI state ----
      setPerf({
        rightOn: !!frame.right,
        leftOn: !!frame.left,
        volume: frame.right?.openness ?? 0,
        rate: frame.right?.rateIndex ?? 2,
        vibrato: frame.right?.vibrato ?? 0,
        voicing: frame.left?.voicing ?? 1,
        velocity: frame.left?.velocity ?? 0.8,
        pinching: frame.left?.pinching ?? false,
        quality: frame.quality,
      });

      draw(ctx, canvas, hands, frame, ripple, now);
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
  }, [stream, setPerf]);

  return (
    <div className="stage">
      <video ref={videoRef} className="stage-video" playsInline muted />
      <canvas ref={canvasRef} className="stage-canvas" />
    </div>
  );
}

/* --------------------------------- drawing --------------------------------- */

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  hands: TrackedHand[],
  frame: GestureFrame,
  ripple: { at: number; x: number; y: number },
  now: number,
) {
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);

  // ---- harmony zone (left 35%): mint wash + richness bands ----
  const hx = HARMONY_ZONE_MAX_X * w;
  ctx.fillStyle = "rgba(62, 240, 182, 0.045)";
  ctx.fillRect(0, 0, hx, h);
  ctx.strokeStyle = "rgba(62, 240, 182, 0.22)";
  ctx.setLineDash([6, 10]);
  ctx.lineWidth = 1;
  for (const frac of [1 / 3, 2 / 3]) {
    ctx.beginPath();
    ctx.moveTo(0, h * frac);
    ctx.lineTo(hx, h * frac);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.font = "600 11px 'Instrument Sans', sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(62, 240, 182, 0.4)";
  ctx.fillText("LUSH", 14, h / 6);
  ctx.fillText("CHORD", 14, h / 2);
  ctx.fillText("BASS", 14, (5 * h) / 6);

  ctx.strokeStyle = "rgba(244, 239, 233, 0.1)";
  ctx.beginPath();
  ctx.moveTo(hx, 0);
  ctx.lineTo(hx, h);
  ctx.stroke();

  // ---- rhythm rail along the bottom of the performance zone ----
  const railY = h - 34;
  for (let i = 0; i < 5; i++) {
    const cx = hx + ((i + 0.5) / 5) * (w - hx);
    const active = frame.right && frame.right.rateIndex === i;
    ctx.beginPath();
    ctx.arc(cx, railY, active ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = active ? CORAL : "rgba(244, 239, 233, 0.25)";
    if (active) {
      ctx.shadowColor = CORAL;
      ctx.shadowBlur = 10;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = active ? CORAL : "rgba(244, 239, 233, 0.3)";
    ctx.textAlign = "center";
    ctx.font = "600 10px 'Instrument Sans', sans-serif";
    ctx.fillText(RATE_LABELS[i], cx, railY + 20);
  }

  // ---- hand skeletons ----
  for (const hand of hands) {
    const color = hand.side === "left" ? MINT : CORAL;
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
      ctx.arc(lm.x * w, lm.y * h, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // ---- right-hand HUD: volume ring + push glow ----
  if (frame.right) {
    const { x, y, openness, pushProgress } = frame.right;
    const cx = x * w;
    const cy = y * h;
    const r = 52;

    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255, 92, 56, 0.18)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = CORAL;
    ctx.shadowColor = CORAL;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + openness * Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // z-push charge-up: amber ring tightens as the hand nears the camera
    if (pushProgress > 0.15) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = AMBER;
      ctx.globalAlpha = pushProgress;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 16 - pushProgress * 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ---- left-hand HUD: height marker; pinch = velocity dial ----
  if (frame.left) {
    const ly = frame.left.y * h;
    ctx.lineWidth = 2;
    ctx.strokeStyle = frame.left.pinching ? AMBER : MINT;
    ctx.beginPath();
    ctx.moveTo(0, ly);
    ctx.lineTo(hx, ly);
    ctx.stroke();
    if (frame.left.pinching) {
      ctx.fillStyle = AMBER;
      ctx.font = "600 12px 'Instrument Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`VELOCITY ${Math.round(frame.left.velocity * 100)}`, 14, ly - 10);
    }
  }

  // ---- chord-change ripple ----
  const age = now - ripple.at;
  if (age < 500) {
    const p = age / 500;
    ctx.lineWidth = 3 * (1 - p);
    ctx.strokeStyle = AMBER;
    ctx.globalAlpha = 1 - p;
    ctx.beginPath();
    ctx.arc(ripple.x * canvas.width, ripple.y * canvas.height, 60 + p * 160, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
