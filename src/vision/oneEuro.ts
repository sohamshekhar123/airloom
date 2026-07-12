/**
 * One Euro filter — adaptive smoothing for noisy human input.
 *
 * Unlike a fixed EMA, the cutoff frequency adapts to speed:
 *  - hand moving slowly  -> heavy smoothing -> no jitter
 *  - hand moving fast    -> light smoothing -> no perceptible lag
 *
 * Reference: Casiez, Roussel & Vogel, CHI 2012.
 */

class LowPass {
  private y: number | null = null;

  filter(x: number, alpha: number): number {
    if (this.y === null) {
      this.y = x;
    } else {
      this.y = alpha * x + (1 - alpha) * this.y;
    }
    return this.y;
  }

  last(): number | null {
    return this.y;
  }

  reset(): void {
    this.y = null;
  }
}

export class OneEuroFilter {
  private xFilter = new LowPass();
  private dxFilter = new LowPass();
  private lastTime: number | null = null;

  constructor(
    /** Minimum cutoff frequency (Hz). Lower = smoother at rest. */
    private minCutoff = 1.0,
    /** Speed coefficient. Higher = less lag during fast motion. */
    private beta = 0.007,
    /** Cutoff for the derivative filter. */
    private dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** @param t timestamp in seconds */
  filter(x: number, t: number): number {
    if (this.lastTime === null) {
      this.lastTime = t;
      this.dxFilter.filter(0, this.alpha(this.dCutoff, 1 / 60));
      return this.xFilter.filter(x, 1);
    }
    const dt = Math.max(t - this.lastTime, 1e-6);
    this.lastTime = t;

    const prev = this.xFilter.last() ?? x;
    const dx = (x - prev) / dt;
    const edx = this.dxFilter.filter(dx, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(x, this.alpha(cutoff, dt));
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}
