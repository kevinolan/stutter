import { calcStreak, formatDate } from '../utils/helpers';

describe('helpers', () => {
  test('formatDate returns a non-empty string', () => {
    const s = formatDate(new Date().toISOString());
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });

  test('calcStreak handles empty list', () => {
    expect(calcStreak([])).toBe(0);
  });
});
