// Stable colors per subject, derived from the subject name.

import type { CSSProperties } from 'react';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Hand-picked hues that read well on light and dark backgrounds.
const HUES = [18, 42, 70, 105, 145, 170, 195, 220, 245, 270, 295, 320, 345];

export function subjectHue(name: string | null | undefined): number {
  if (!name) return 255;
  return HUES[hash(name.trim().toLowerCase()) % HUES.length];
}

/** CSS variables (--sub, --sub-soft, --sub-text) for a subject's color. */
export function subjectStyle(name: string | null | undefined): CSSProperties {
  return { '--h': subjectHue(name) } as CSSProperties;
}

/** Color for a grade quality between 0 (worst) and 1 (best). */
export function qualityStyle(quality: number | null): CSSProperties {
  if (quality == null) return { '--h': 255, '--c': 0.02 } as CSSProperties;
  // Fixed steps instead of a smooth ramp: hues between yellow and green look muddy.
  const [h, c] = quality >= 0.88 ? [158, 0.15] : quality >= 0.7 ? [140, 0.15] : quality >= 0.5 ? [80, 0.16] : quality >= 0.3 ? [52, 0.17] : [25, 0.18];
  return { '--h': h, '--c': c } as CSSProperties;
}
