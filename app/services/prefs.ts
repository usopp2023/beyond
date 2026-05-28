// Lightweight in-memory preferences. Resets on app cold start — acceptable
// for now; swap to AsyncStorage when we next rebuild the native app.

export type StrengthCap = 'low' | 'med' | 'high';

// Firmware levels: 0=HIGH, 1=MED, 2=LOW, 3=OFF.
// Cap is the *minimum* numeric level the app may write — anything stronger
// (smaller number) gets clamped up to this floor.
const CAP_TO_FLOOR: Record<StrengthCap, 0 | 1 | 2> = {
  low: 2,   // only 轻柔 allowed
  med: 1,   // 轻柔 + 流动
  high: 0,  // unrestricted
};

let strengthCap: StrengthCap = 'high';
const capListeners = new Set<(c: StrengthCap) => void>();

export function getStrengthCap(): StrengthCap {
  return strengthCap;
}

export function setStrengthCap(c: StrengthCap): void {
  strengthCap = c;
  capListeners.forEach((l) => l(c));
}

export function subscribeStrengthCap(fn: (c: StrengthCap) => void): () => void {
  capListeners.add(fn);
  return () => capListeners.delete(fn);
}

export function clampLevelByCap(level: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
  if (level === 3) return 3; // OFF always passes
  const floor = CAP_TO_FLOOR[strengthCap];
  return (Math.max(level, floor) as 0 | 1 | 2 | 3);
}

export function resetAllPrefs(): void {
  strengthCap = 'high';
  capListeners.forEach((l) => l(strengthCap));
}

export const CAP_LABELS: Record<StrengthCap, string> = {
  low: '轻柔',
  med: '中等',
  high: '不限',
};
