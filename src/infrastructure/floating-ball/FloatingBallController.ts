import type { BallPosition } from '@/shared/types';

const SNAP_THRESHOLD_PX = 80;
const BALL_SIZE_PX = 40;

/**
 * Pure drag/dock state machine. No DOM access; takes viewport dims and
 * pointer coordinates, returns new positions. Tested in jsdom without
 * needing real layout.
 */
export class FloatingBallController {
  /**
   * Update a free position by a pointer delta. Clamps to viewport bounds.
   * The current position is always `{x, y}` (free mode) during an active
   * drag — docking only happens on release.
   */
  onDrag(
    current: { x: number; y: number },
    delta: { dx: number; dy: number },
    viewport: { w: number; h: number } = { w: window.innerWidth, h: window.innerHeight }
  ): { x: number; y: number } {
    const x = clamp(current.x + delta.dx, 0, viewport.w - BALL_SIZE_PX);
    const y = clamp(current.y + delta.dy, 0, viewport.h - BALL_SIZE_PX);
    return { x, y };
  }

  /**
   * Decide whether to dock to an edge or stay free, based on proximity
   * to viewport edges. Within SNAP_THRESHOLD_PX of any edge → dock to
   * that edge. Otherwise stay free.
   *
   * If two edges are equally close (corner), prefer horizontal (left/right).
   */
  computeRelease(
    releasePoint: { x: number; y: number },
    viewport: { w: number; h: number }
  ): BallPosition {
    const { x, y } = releasePoint;
    const nearLeft = x <= SNAP_THRESHOLD_PX;
    const nearRight = x >= viewport.w - SNAP_THRESHOLD_PX;
    const nearTop = y <= SNAP_THRESHOLD_PX;
    const nearBottom = y >= viewport.h - SNAP_THRESHOLD_PX;

    if (nearLeft) return { mode: 'docked', edge: 'left', offsetAlong: y };
    if (nearRight) return { mode: 'docked', edge: 'right', offsetAlong: y };
    if (nearTop) return { mode: 'docked', edge: 'top', offsetAlong: x };
    if (nearBottom) return { mode: 'docked', edge: 'bottom', offsetAlong: x };

    return { mode: 'free', x, y };
  }

  /**
   * Convert a BallPosition to CSS properties for the ball element.
   * `offsetAlong` is the position along the edge (e.g., for `bottom`
   * edge, it's the X offset from the left of the viewport).
   */
  toCss(pos: BallPosition): {
    top?: string; bottom?: string; left?: string; right?: string;
  } {
    if (pos.mode === 'free') {
      return { top: `${pos.y}px`, left: `${pos.x}px` };
    }
    const off = `${pos.offsetAlong}px`;
    switch (pos.edge) {
      case 'top': return { top: '0px', left: off };
      case 'bottom': return { bottom: '0px', left: off };
      case 'left': return { left: '0px', top: off };
      case 'right': return { right: '0px', top: off };
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
