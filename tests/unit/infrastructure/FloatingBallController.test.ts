import { describe, expect, it } from 'vitest';
import { FloatingBallController } from '@/infrastructure/floating-ball/FloatingBallController';

const VIEWPORT = { w: 1280, h: 800 };

describe('FloatingBallController', () => {
  const controller = new FloatingBallController();

  describe('onDrag', () => {
    it('updates position by delta', () => {
      const next = controller.onDrag({ x: 100, y: 200 }, { dx: 10, dy: -5 });
      expect(next).toEqual({ x: 110, y: 195 });
    });

    it('clamps to viewport bounds (with margin)', () => {
      const next = controller.onDrag({ x: 1270, y: 790 }, { dx: 100, dy: 100 });
      // Ball is ~40px; allow it to stay within viewport.
      expect(next.x).toBeLessThanOrEqual(VIEWPORT.w);
      expect(next.y).toBeLessThanOrEqual(VIEWPORT.h);
    });
  });

  describe('computeRelease', () => {
    it('snaps to right edge when released near right', () => {
      const pos = controller.computeRelease({ x: 1260, y: 400 }, VIEWPORT);
      expect(pos.mode).toBe('docked');
      if (pos.mode === 'docked') {
        expect(pos.edge).toBe('right');
      }
    });

    it('snaps to bottom edge when released near bottom', () => {
      const pos = controller.computeRelease({ x: 640, y: 790 }, VIEWPORT);
      expect(pos.mode).toBe('docked');
      if (pos.mode === 'docked') {
        expect(pos.edge).toBe('bottom');
      }
    });

    it('stays free when released in the middle', () => {
      const pos = controller.computeRelease({ x: 640, y: 400 }, VIEWPORT);
      expect(pos.mode).toBe('free');
      if (pos.mode === 'free') {
        expect(pos.x).toBe(640);
        expect(pos.y).toBe(400);
      }
    });
  });

  describe('toCss', () => {
    it('docked bottom positions with bottom + right/left', () => {
      const css = controller.toCss({ mode: 'docked', edge: 'bottom', offsetAlong: 60 });
      expect(css.bottom).toBeDefined();
    });

    it('docked right positions with right + top/bottom', () => {
      const css = controller.toCss({ mode: 'docked', edge: 'right', offsetAlong: 60 });
      expect(css.right).toBeDefined();
    });

    it('free positions with top + left', () => {
      const css = controller.toCss({ mode: 'free', x: 100, y: 200 });
      expect(css.top).toBe('200px');
      expect(css.left).toBe('100px');
    });
  });
});
