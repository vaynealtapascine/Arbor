/** Keep slow taps and vertical/diagonal scrolling out of horizontal row actions. */
export function gestureAxis(dx: number, dy: number): 'x' | 'y' | null {
  if (Math.hypot(dx, dy) <= 8) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
}

export const SWIPE_LIMIT = 140;
export const SWIPE_THRESHOLD = 80;
export const HOLD_DELAY = 430;

/** Canceled pointer streams can never mutate an item, however far they moved. */
export function swipeAction(offset: number, canceled = false): 'pin' | 'archive' | null {
  if (canceled || Math.abs(offset) <= SWIPE_THRESHOLD) return null;
  return offset > 0 ? 'pin' : 'archive';
}
