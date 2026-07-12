/**
 * MediaPipe HandLandmarker wrapper.
 * Runs on the GPU delegate in VIDEO mode — one inference per rendered frame.
 */
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

export interface TrackedHand {
  /** "left" | "right" — the USER's hand, in mirrored (what-you-see) space */
  side: "left" | "right";
  /** 0..1 confidence from the model */
  confidence: number;
  /** 21 landmarks, x/y normalized 0..1 in MIRRORED space (matches on-screen view) */
  landmarks: { x: number; y: number; z: number }[];
}

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

let landmarker: HandLandmarker | null = null;

export async function initTracker(): Promise<void> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);
  landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export function detectHands(
  video: HTMLVideoElement,
  timestampMs: number,
): TrackedHand[] {
  if (!landmarker || video.readyState < 2) return [];

  let result: HandLandmarkerResult;
  try {
    result = landmarker.detectForVideo(video, timestampMs);
  } catch {
    return [];
  }

  const hands: TrackedHand[] = [];
  for (let i = 0; i < result.landmarks.length; i++) {
    const handedness = result.handedness[i]?.[0];
    if (!handedness) continue;
    // MediaPipe labels handedness assuming a mirrored (selfie) image, but
    // getUserMedia frames are raw. Net effect: the model's "Left" is the
    // user's right hand. We also mirror x so coordinates match the
    // mirrored video the user sees.
    const side = handedness.categoryName === "Left" ? "right" : "left";
    hands.push({
      side,
      confidence: handedness.score,
      landmarks: result.landmarks[i].map((lm) => ({
        x: 1 - lm.x,
        y: lm.y,
        z: lm.z,
      })),
    });
  }
  return hands;
}

/** Landmark indices we care about (MediaPipe hand model). */
export const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_PIP: 6,
  INDEX_TIP: 8,
  MIDDLE_PIP: 10,
  MIDDLE_TIP: 12,
  RING_PIP: 14,
  RING_TIP: 16,
  PINKY_PIP: 18,
  PINKY_TIP: 20,
} as const;

/** Skeleton connections for drawing. */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
