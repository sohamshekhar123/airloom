/**
 * Turns raw hand landmarks into musical intent.
 *
 * Two parallel paths (this is the core latency design):
 *  - CONTINUOUS path: One Euro-filtered positions -> chord voicing, brightness.
 *    Routed only to slow-attack sounds, where ~60ms of camera lag is inaudible.
 *  - TRIGGER path: raw 3-frame velocity + Schmitt trigger -> strikes.
 *    Strikes are quantized to the audio clock's next grid slot, so they
 *    always LAND perfectly in time regardless of camera latency.
 */
import { LM, type TrackedHand } from "../vision/tracker";
import { OneEuroFilter } from "../vision/oneEuro";
import type { VoicingLevel } from "../music/moods";

/** User-view layout: left 35% = harmony zone, right 65% = three trigger lanes. */
export const HARMONY_ZONE_MAX_X = 0.35;
export type Lane = "arp" | "chord" | "drum";

export interface GestureFrame {
  /** null when the left hand isn't visible */
  harmony: {
    /** 0 (bottom, bass only) .. 2 (top, lush extensions) */
    voicing: VoicingLevel;
    /** 0..1 continuous height for filter brightness */
    height: number;
    /** closed fist = dampen everything */
    fist: boolean;
  } | null;
  /** Strike fired THIS frame (already debounced), null otherwise */
  strike: { lane: Lane; velocity: number } | null;
  /** Which lane the right hand is hovering, for UI highlighting */
  hoverLane: Lane | null;
  /** 0..1 rough tracking quality for the status dot */
  quality: number;
}

const STRIKE_ARM_THRESHOLD = 1.1; // normalized units/sec, downward
const STRIKE_REARM_THRESHOLD = 0.35;
const STRIKE_MIN_INTERVAL_MS = 120; // hard debounce

export function laneForX(x: number): Lane {
  // Right 65% of user view, split into three columns
  const t = (x - HARMONY_ZONE_MAX_X) / (1 - HARMONY_ZONE_MAX_X);
  if (t < 1 / 3) return "arp";
  if (t < 2 / 3) return "chord";
  return "drum";
}

export class GestureInterpreter {
  private leftYFilter = new OneEuroFilter(1.2, 0.01);
  private velWindow: { y: number; t: number }[] = [];
  private armed = true;
  private lastStrikeAt = 0;

  update(hands: TrackedHand[], nowMs: number): GestureFrame {
    const t = nowMs / 1000;
    const left = hands.find((h) => h.side === "left");
    const right = hands.find((h) => h.side === "right");

    // ---- Continuous path: left hand = The Conductor ----
    let harmony: GestureFrame["harmony"] = null;
    if (left && left.landmarks[LM.WRIST].x < HARMONY_ZONE_MAX_X + 0.12) {
      const rawY = left.landmarks[LM.WRIST].y;
      const y = this.leftYFilter.filter(rawY, t);
      const height = 1 - Math.min(Math.max(y, 0), 1); // up = more
      const voicing: VoicingLevel = height > 0.66 ? 2 : height > 0.33 ? 1 : 0;
      harmony = { voicing, height, fist: isFist(left) };
    } else {
      this.leftYFilter.reset();
    }

    // ---- Trigger path: right hand = The Performer ----
    let strike: GestureFrame["strike"] = null;
    let hoverLane: Lane | null = null;
    if (right) {
      const wrist = right.landmarks[LM.WRIST];
      if (wrist.x >= HARMONY_ZONE_MAX_X) {
        hoverLane = laneForX(wrist.x);
      }

      // Downward velocity over a ~3-frame window (raw, unfiltered — speed matters)
      this.velWindow.push({ y: wrist.y, t });
      if (this.velWindow.length > 3) this.velWindow.shift();
      if (this.velWindow.length === 3 && hoverLane) {
        const a = this.velWindow[0];
        const b = this.velWindow[2];
        const vy = (b.y - a.y) / Math.max(b.t - a.t, 1e-6); // + = downward

        // Schmitt trigger: fire once on crossing, re-arm only after slowing down
        if (
          this.armed &&
          vy > STRIKE_ARM_THRESHOLD &&
          nowMs - this.lastStrikeAt > STRIKE_MIN_INTERVAL_MS
        ) {
          this.armed = false;
          this.lastStrikeAt = nowMs;
          const velocity = Math.min(0.4 + ((vy - STRIKE_ARM_THRESHOLD) / 2.5) * 0.6, 1);
          strike = { lane: hoverLane, velocity };
        } else if (!this.armed && vy < STRIKE_REARM_THRESHOLD) {
          this.armed = true;
        }
      }
    } else {
      this.velWindow.length = 0;
      this.armed = true;
    }

    const quality =
      hands.length === 0
        ? 0
        : hands.reduce((s, h) => s + h.confidence, 0) / hands.length;

    return { harmony, strike, hoverLane, quality };
  }
}

/** Fist heuristic: all four fingertips folded below their middle knuckles. */
function isFist(hand: TrackedHand): boolean {
  const lm = hand.landmarks;
  const wrist = lm[LM.WRIST];
  const pairs: [number, number][] = [
    [LM.INDEX_TIP, LM.INDEX_PIP],
    [LM.MIDDLE_TIP, LM.MIDDLE_PIP],
    [LM.RING_TIP, LM.RING_PIP],
    [LM.PINKY_TIP, LM.PINKY_PIP],
  ];
  let folded = 0;
  for (const [tip, pip] of pairs) {
    const dTip = Math.hypot(lm[tip].x - wrist.x, lm[tip].y - wrist.y);
    const dPip = Math.hypot(lm[pip].x - wrist.x, lm[pip].y - wrist.y);
    if (dTip < dPip) folded++;
  }
  return folded >= 3;
}
