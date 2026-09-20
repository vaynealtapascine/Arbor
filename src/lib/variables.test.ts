import { describe, expect, it } from 'vitest';
import { fillVariables } from './variables';

describe('fillVariables', () => {
  const at = new Date(2026, 8, 20, 14, 5); // Sunday 20 September 2026, 14:05 local

  it('fills every placeholder, case-insensitively', () => {
    expect(fillVariables('{Name} review — {date} {time}', 'Q3', at)).toBe('Q3 review — 2026-09-20 14:05');
    expect(fillVariables('{weekday}, {month} {year} (week {week})', '', at)).toBe('Sunday, September 2026 (week 38)');
    expect(fillVariables('{today}', '', at)).toBe('2026-09-20');
  });

  it('leaves unknown braces alone', () => {
    expect(fillVariables('keep {this} and {}', 'x', at)).toBe('keep {this} and {}');
  });

  it('uses ISO week numbering across the year boundary', () => {
    expect(fillVariables('{week}', '', new Date(2027, 0, 1))).toBe('53');
    expect(fillVariables('{week}', '', new Date(2026, 0, 1))).toBe('1');
  });
});
