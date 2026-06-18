import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import App from "@/interface-adapters/floating-panel/App";
import { FloatingBallController } from "./FloatingBallController";
import type { BallPosition } from "@/shared/types";
// Vite ?inline query: imports the compiled CSS as a string.
// @ts-ignore — Vite provides the type via the *.css?inline module declaration
import panelCss from "@/interface-adapters/floating-panel/floating-panel.css?inline";

const HOST_ID = "qrt-floating-root";
const BALL_ID = "qrt-floating-ball";
const PANEL_ID = "qrt-floating-panel";
const PANEL_MOUNT_ID = "qrt-panel-mount";
const STORAGE_KEY_PREFIX = "floatingBall:";

/**
 * Host-side orchestrator for the floating ball + docked panel.
 * Responsibilities:
 *   1. Create a host-facing <div> with z-index max + pointer-events: none.
 *   2. Attach an open shadow root; inject compiled Tailwind CSS.
 *   3. Render the ball + panel skeleton; mount React into panel.
 *   4. Wire pointer events to FloatingBallController.
 *   5. Persist position to chrome.storage.local keyed by hostname.
 *   6. Watch for host page removing our root (SPA navigations) and reattach.
 */
export class FloatingBallHost {
  private controller = new FloatingBallController();
  private root: Root | null = null;
  private hostEl: HTMLDivElement | null = null;
  private ballEl: HTMLDivElement | null = null;
  private panelEl: HTMLDivElement | null = null;
  private position: BallPosition = {
    mode: 'docked', edge: 'bottom',
    // Will be overwritten by loadPosition() once attached.
    offsetAlong: typeof window !== 'undefined' ? window.innerWidth - 60 : 0,
  };
  private dragState:
    | { kind: 'idle' }
    | { kind: 'dragging'; startX: number; startY: number; currentX: number; currentY: number } =
    { kind: 'idle' };
  private observer: MutationObserver | null = null;

  async attach(): Promise<void> {
    if (document.getElementById(HOST_ID)) return;

    this.hostEl = document.createElement('div');
    this.hostEl.id = HOST_ID;
    this.hostEl.style.cssText =
      'position:fixed; z-index:2147483647; inset:0; pointer-events:none;';
    document.documentElement.appendChild(this.hostEl);

    const shadow = this.hostEl.attachShadow({ mode: 'open' });

    // Inject compiled CSS
    const styleEl = document.createElement('style');
    styleEl.textContent = panelCss;
    shadow.appendChild(styleEl);

    // Ball
    this.ballEl = document.createElement('div');
    this.ballEl.id = BALL_ID;
    this.ballEl.style.cssText =
      'position:fixed; width:40px; height:40px; border-radius:50%; ' +
      'background:#247e5a; color:white; display:flex; align-items:center; ' +
      'justify-content:center; cursor:grab; font-size:14px; ' +
      'pointer-events:auto; user-select:none; box-shadow:0 2px 8px rgba(0,0,0,0.2);';
    this.ballEl.textContent = '译';
    shadow.appendChild(this.ballEl);

    // Panel (hidden initially)
    this.panelEl = document.createElement('div');
    this.panelEl.id = PANEL_ID;
    this.panelEl.style.cssText =
      'position:fixed; pointer-events:auto; display:none; z-index:2147483647;';
    const mount = document.createElement('div');
    mount.id = PANEL_MOUNT_ID;
    this.panelEl.appendChild(mount);
    shadow.appendChild(this.panelEl);

    // Mount React
    this.root = createRoot(mount);
    this.root.render(<App />);

    // Load persisted position
    await this.loadPosition();
    this.applyPositionToDom();

    // Wire pointer events
    this.wireBallEvents();

    // Watch for host removal
    this.observer = new MutationObserver(() => {
      if (!document.getElementById(HOST_ID)) {
        this.attach().catch((e) => console.error('[qrt] reattach failed:', e));
      }
    });
    this.observer.observe(document.documentElement, { childList: true });
  }

  detach(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.root?.unmount();
    this.root = null;
    this.hostEl?.remove();
    this.hostEl = null;
    this.ballEl = null;
    this.panelEl = null;
  }

  togglePanel(): void {
    if (!this.panelEl) return;
    const isHidden = this.panelEl.style.display === 'none';
    this.panelEl.style.display = isHidden ? 'block' : 'none';
    if (isHidden && this.ballEl) {
      // Position panel above the ball (rough heuristic; can be improved).
      const ballRect = this.ballEl.getBoundingClientRect();
      this.panelEl.style.right = `${window.innerWidth - ballRect.right}px`;
      this.panelEl.style.bottom = `${window.innerHeight - ballRect.top + 8}px`;
    }
  }

  private wireBallEvents(): void {
    if (!this.ballEl) return;
    const ball = this.ballEl;

    ball.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ball.setPointerCapture(e.pointerId);
      this.dragState = {
        kind: 'dragging',
        startX: e.clientX, startY: e.clientY,
        currentX: e.clientX, currentY: e.clientY,
      };
    });

    ball.addEventListener('pointermove', (e) => {
      if (this.dragState.kind !== 'dragging' || !this.ballEl) return;
      const prev = { x: this.dragState.currentX, y: this.dragState.currentY };
      // Ball top-left tracks pointer minus half the ball size so the cursor
      // stays roughly centered on it during the drag.
      const ballX = e.clientX - 20;
      const ballY = e.clientY - 20;
      const delta = { dx: ballX - (prev.x - 20), dy: ballY - (prev.y - 20) };
      this.dragState.currentX = e.clientX;
      this.dragState.currentY = e.clientY;
      // Route through the controller so the live drag is clamped to the
      // viewport (prevents losing the ball off-screen mid-drag).
      const next = this.controller.onDrag(
        { x: ballX, y: ballY },
        delta,
        { w: window.innerWidth, h: window.innerHeight }
      );
      this.ballEl.style.left = `${next.x}px`;
      this.ballEl.style.top = `${next.y}px`;
      this.ballEl.style.right = 'auto';
      this.ballEl.style.bottom = 'auto';
    });

    ball.addEventListener('pointerup', async (e) => {
      if (this.dragState.kind !== 'dragging') return;
      const start = { x: this.dragState.startX, y: this.dragState.startY };
      const end = { x: this.dragState.currentX, y: this.dragState.currentY };
      const moved = Math.hypot(end.x - start.x, end.y - start.y);
      this.dragState = { kind: 'idle' };

      if (moved < 3) {
        // Treat as click
        this.togglePanel();
        return;
      }

      this.position = this.controller.computeRelease(end, {
        w: window.innerWidth, h: window.innerHeight,
      });
      this.applyPositionToDom();
      await this.savePosition();
    });
  }

  private applyPositionToDom(): void {
    if (!this.ballEl) return;
    const css = this.controller.toCss(this.position);
    this.ballEl.style.top = css.top ?? '';
    this.ballEl.style.bottom = css.bottom ?? '';
    this.ballEl.style.left = css.left ?? '';
    this.ballEl.style.right = css.right ?? '';
  }

  private async loadPosition(): Promise<void> {
    try {
      const key = `${STORAGE_KEY_PREFIX}${location.hostname}`;
      const data = await browser.storage.local.get(key);
      const stored = data[key] as BallPosition | undefined;
      if (stored) this.position = stored;
    } catch (e) {
      console.error('[qrt] load position failed:', e);
    }
  }

  private async savePosition(): Promise<void> {
    try {
      const key = `${STORAGE_KEY_PREFIX}${location.hostname}`;
      await browser.storage.local.set({ [key]: this.position });
    } catch (e) {
      console.error('[qrt] save position failed:', e);
    }
  }
}
