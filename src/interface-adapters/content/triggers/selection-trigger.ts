/**
 * Selection trigger: invoke `callback` with the current text selection
 * whenever the user finishes a mouse-based selection (mouseup).
 *
 * Empty selections are filtered out so the callback only fires when there
 * is actual text to translate. The trimmed selection string is passed to
 * the callback so the orchestrator can filter blocks by selection content.
 *
 * Returns a dispose function that removes the listener.
 */
export function listenSelection(callback: (selection: string) => void): () => void {
  const handler = () => {
    const selection = window.getSelection()?.toString().trim() ?? "";
    if (selection.length > 0) {
      callback(selection);
    }
  };
  document.addEventListener("mouseup", handler);
  return () => document.removeEventListener("mouseup", handler);
}
