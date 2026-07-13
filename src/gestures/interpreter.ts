/**
 * Turns raw hand landmarks into musical intent.
 *
 * RIGHT HAND — The Performer (coral):
 *   openness (fist..splayed)  -> volume, continuous
 *   x position                -> rhythm rate (hold / 1/2 / 1/4 / 1/8 / 1/16)
 *   y position                -> vibrato (pitch modulation), up = more
 *   pinch (thumb+index)       -> advance to the next chord
 *
 * LEFT HAND — The Conductor (mint):
 *   y position                -> chord richness (bass / chord / lush)
 *   pinch (thumb+index) held  -> y sets note velocity instead; the value
 *                                LATCHES when the pinch releases
 *
 * All continuous controls are One Euro-filtered; discrete events (chord
 * advance) use raw data + hysteresis so they stay snappy. Volume openness
 * deliberately ignores the index finger so a right-hand pinch doesn't
 * dip the volume.
 */
import { LM, type TrackedHand } from "../vision/tracker";
import { OneEuroFilter } from "../vision/oneEuro";
import type { VoicingLevel } from "../music/progressions";

export const HARMONY_ZONE_MAX_X = 0.35;

export const RATE_LABELS = ["HOLD", "1/2", "1/4", "1/8", "1/16"] as const;

export interface RightHandFrame {
  /** 0..1 — closed fist to fully open */
  openness: number;
  /** 0..4 index into RATE_LABELS */
  rateIndex: number;
  /** 0..1 raw horizontal position within the performance zone (for HUD) */
  rateT: number;
  /** 0..1 vibrato amount */
  vibrato: number;
  /** pinch currently held (for HUD) */
  pinching: boolean;
  /** true exactly once per pinch — advance the chord */
  advanced: boolean;
  /** wrist position in mirrored screen space (for HUD) */
  x: number;
  y: number;
}

export interface LeftHandFrame {
  /** 0..1 hand height (up = 1) */
  height: number;
  voicing: VoicingLevel;
  pinching: boolean;
  /** 0..1 latched note velocity */
  velocity: number;
  x: number;
  y: number;
}

export interface GestureFrame {
  right: RightHandFrame | null;
  left: LeftHandFrame | null;
  quality: number;
}

const PINCH_ON = 0.35; // thumb-index distance / palm size, engage below
const PINCH_OFF = 0.55; // release above (hysteresis)
const ADVANCE_DEBOUNCE_MS = 400;

export class GestureInterpreter {
  private rOpen = new OneEuroFilter(1.5, 0.02);
  private rX = new OneEuroFilter(1.2, 0.01);
  private rY = new OneEuroFilter(1.2, 0.01);
  private lY = new OneEuroFilter(1.2, 0.01);

  private rPinched = false;
  private lastAdvanceAt = 0;
  private lPinched = false;
  private latchedVelocity = 0.8;

  update(hands: TrackedHand[], nowMs: number): GestureFrame {
    const t = nowMs / 1000;
    const leftHand = hands.find((h) => h.side === "left");
    const rightHand = hands.find((h) => h.side === "right");

    // ------------------------- RIGHT: The Performer -------------------------
    let right: RightHandFrame | null = null;
    if (rightHand) {
      const wrist = rightHand.landmarks[LM.WRIST];

      const openness = this.rOpen.filter(handOpenness(rightHand), t);
      const x = this.rX.filter(wrist.x, t);
      const y = this.rY.filter(wrist.y, t);

      const rateT = clamp01((x - HARMONY_ZONE_MAX_X) / (1 - HARMONY_ZONE_MAX_X));
      const rateIndex = Math.min(Math.floor(rateT * 5), 4);
      const vibrato = clamp01((0.55 - y) / 0.45);

      // pinch -> next chord, with hysteresis + debounce
      const pd = pinchDistance(rightHand);
      let advanced = false;
      if (!this.rPinched && pd < PINCH_ON) {
        this.rPinched = true;
        if (nowMs - this.lastAdvanceAt > ADVANCE_DEBOUNCE_MS) {
          advanced = true;
          this.lastAdvanceAt = nowMs;
        }
      } else if (this.rPinched && pd > PINCH_OFF) {
        this.rPinched = false;
      }

      right = {
        openness,
        rateIndex,
        rateT,
        vibrato,
        pinching: this.rPinched,
        advanced,
        x,
        y,
      };
    } else {
      this.rOpen.reset();
      this.rX.reset();
      this.rY.reset();
      this.rPinched = false;
    }

    // ------------------------- LEFT: The Conductor -------------------------
    let left: LeftHandFrame | null = null;
    if (leftHand) {
      const wrist = leftHand.landmarks[LM.WRIST];
      const y = this.lY.filter(wrist.y, t);
      const height = 1 - clamp01(y);

      const pd = pinchDistance(leftHand);
      if (!this.lPinched && pd < PINCH_ON) this.lPinched = true;
      else if (this.lPinched && pd > PINCH_OFF) this.lPinched = false;

      if (this.lPinched) {
        // While pinched, height DIALS velocity; it stays after release.
        this.latchedVelocity = 0.15 + height * 0.85;
      }
      const voicing: VoicingLevel = height > 0.66 ? 2 : height > 0.33 ? 1 : 0;

      left = {
        height,
        voicing,
        pinching: this.lPinched,
        velocity: this.latchedVelocity,
        x: wrist.x,
        y,
      };
    } else {
      this.lY.reset();
      this.lPinched = false;
    }

    const quality =
      hands.length === 0
        ? 0
        : hands.reduce((s, h) => s + h.confidence, 0) / hands.length;

    return { right, left, quality };
  }
}

/* ------------------------------- heuristics ------------------------------- */

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** Palm size in screen units, for scale-invariant thresholds. */
function handScale(hand: TrackedHand): number {
  const lm = hand.landmarks;
  const wrist = lm[LM.WRIST];
  const mcp = lm[9]; // middle finger MCP
  return Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);
}

/**
 * 0 = fist, 1 = fully splayed. Uses middle/ring/pinky only, so pinching
 * (thumb+index) doesn't read as "closing the hand".
 */
function handOpenness(hand: TrackedHand): number {
  const lm = hand.landmarks;
  const wrist = lm[LM.WRIST];
  const scale = handScale(hand) || 1e-6;
  const tips = [LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP];
  let sum = 0;
  for (const tip of tips) {
    sum += Math.hypot(lm[tip].x - wrist.x, lm[tip].y - wrist.y);
  }
  const avg = sum / tips.length / scale;
  // fist ≈ 0.9, open ≈ 1.9 (empirically stable across hand sizes)
  return clamp01((avg - 0.95) / 0.95);
}

/** Thumb-index tip distance normalized by palm size. */
function pinchDistance(hand: TrackedHand): number {
  const lm = hand.landmarks;
  const scale = handScale(hand) || 1e-6;
  return (
    Math.hypot(
      lm[LM.THUMB_TIP].x - lm[LM.INDEX_TIP].x,
      lm[LM.THUMB_TIP].y - lm[LM.INDEX_TIP].y,
    ) / scale
  );
}
