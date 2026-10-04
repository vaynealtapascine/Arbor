import { describe, expect, it } from 'vitest';
import { gestureAxis, swipeAction } from './gestures';

describe('row gestures', () => {
  it('waits for deliberate movement and leaves diagonal or vertical movement to scrolling', () => {
    expect(gestureAxis(5, 5)).toBeNull();
    expect(gestureAxis(25, 2)).toBe('x');
    expect(gestureAxis(-25, 2)).toBe('x');
    expect(gestureAxis(12, 10)).toBe('y');
    expect(gestureAxis(2, 25)).toBe('y');
  });

  it('pins to the right and archives to the left only past the commit threshold', () => {
    expect(swipeAction(80)).toBeNull();
    expect(swipeAction(-80)).toBeNull();
    expect(swipeAction(81)).toBe('pin');
    expect(swipeAction(-81)).toBe('archive');
  });

  it('never commits canceled or short gestures', () => {
    expect(swipeAction(140, true)).toBeNull();
    expect(swipeAction(-140, true)).toBeNull();
    expect(swipeAction(20)).toBeNull();
  });
});
