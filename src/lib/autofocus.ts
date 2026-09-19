/** Focuses an element on mount, except on touch devices (avoids popping the keyboard). */
export function autofocus(node: HTMLElement, always = false) {
  if (!always && matchMedia('(pointer: coarse)').matches) return;
  node.focus({ preventScroll: true });
  // Some containers (popovers) finish positioning a frame later; make sure focus stuck.
  requestAnimationFrame(() => {
    if (node.isConnected && document.activeElement !== node) node.focus({ preventScroll: true });
  });
}
