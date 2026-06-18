/**
 * Hover button trigger: when the user hovers over a paragraph, heading, or
 * list item, show a small "译" (translate) button at its top-right. Clicking
 * the button fires `onActivate` with the hovered element.
 *
 * The hovered element is passed (rather than its data-qrt-block-id) because
 * extraction runs lazily — the data-qrt-block-id attribute is only set
 * inside handleTrigger, which runs after this click fires. Passing the
 * element lets the caller read the freshly-tagged id after extraction.
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
  onActivate: (hoveredElement: HTMLElement | null) => void
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

  let currentHovered: HTMLElement | null = null;

  button.addEventListener("click", () => {
    onActivate(currentHovered);
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
    currentHovered = target;
  };
  document.addEventListener("mouseover", mouseOverHandler);

  return {
    destroy: () => {
      button.remove();
      document.removeEventListener("mouseover", mouseOverHandler);
    },
  };
}
