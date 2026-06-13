/**
 * Hover button trigger: when the user hovers over a paragraph, heading, or
 * list item, show a small "译" (translate) button at its top-right. Clicking
 * the button fires `onActivate` with the hovered block's data-qrt-block-id.
 *
 * Styling follows the spec (Section 12.6):
 *   - 主品牌绿 background (#00a071), 白色图标
 *   - rounded rectangle, 4px corner radius
 *   - hover darkens to #007354
 *
 * Returns a handle whose destroy() removes the button and unbinds the
 * mouseover listener.
 */

const HOVER_TRIGGER_SELECTORS = "p, h1, h2, h3, h4, h5, h6, li";

/** Sequoia primary brand green. */
const COLOR_PRIMARY = "#00a071";
/** Sequoia hover dark green. */
const COLOR_PRIMARY_HOVER = "#007354";

export interface HoverButtonHandle {
  /** Remove the button from the DOM and unbind the mouseover listener. */
  destroy: () => void;
}

export function createHoverButton(
  onActivate: (blockId: string | null) => void
): HoverButtonHandle {
  const button = document.createElement("button");
  button.textContent = "译";
  button.type = "button";
  button.className = "qrt-hover-button";
  button.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    background: ${COLOR_PRIMARY};
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 13px;
    cursor: pointer;
    display: none;
  `;
  button.addEventListener("mouseenter", () => {
    button.style.background = COLOR_PRIMARY_HOVER;
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = COLOR_PRIMARY;
  });

  let currentBlockId: string | null = null;

  button.addEventListener("click", () => {
    onActivate(currentBlockId);
    button.style.display = "none";
  });

  document.body.appendChild(button);

  const mouseOverHandler = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target || typeof target.matches !== "function") return;
    if (!target.matches(HOVER_TRIGGER_SELECTORS)) return;
    const rect = target.getBoundingClientRect();
    button.style.left = `${rect.right - 30}px`;
    button.style.top = `${rect.top}px`;
    button.style.display = "block";
    currentBlockId = target.dataset.qrtBlockId ?? null;
  };
  document.addEventListener("mouseover", mouseOverHandler);

  return {
    destroy: () => {
      button.remove();
      document.removeEventListener("mouseover", mouseOverHandler);
    },
  };
}
