// Grade scales and averages. Grades are entered by the user and stored on
// the device; WebUntis does not hand them out reliably.

export type ScaleId = 'de' | 'at' | 'points' | 'ru';

export interface GradeOption {
  label: string;
  value: number;
}

export interface Scale {
  id: ScaleId;
  options: GradeOption[];
  /** Maps a grade value to 0 (worst) … 1 (best), for colors. */
  quality(value: number): number;
  /** Decimal places shown for averages. */
  digits: number;
}

function germanOptions(): GradeOption[] {
  const out: GradeOption[] = [];
  for (let n = 1; n <= 6; n++) {
    if (n > 1) out.push({ label: `${n}+`, value: n - 0.3 });
    out.push({ label: `${n}`, value: n });
    if (n < 6) out.push({ label: `${n}-`, value: n + 0.3 });
  }
  return out;
}

export const SCALES: Record<ScaleId, Scale> = {
  de: { id: 'de', options: germanOptions(), quality: (v) => (6 - v) / 5, digits: 2 },
  at: {
    id: 'at',
    options: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n })),
    quality: (v) => (5 - v) / 4,
    digits: 2,
  },
  points: {
    id: 'points',
    options: Array.from({ length: 16 }, (_, i) => ({ label: String(15 - i), value: 15 - i })),
    quality: (v) => v / 15,
    digits: 1,
  },
  ru: {
    id: 'ru',
    options: [5, 4, 3, 2, 1].map((n) => ({ label: String(n), value: n })),
    quality: (v) => (v - 1) / 4,
    digits: 2,
  },
};

export type GradeKind = 'written' | 'oral' | 'other';

export const DEFAULT_WEIGHT: Record<GradeKind, number> = { written: 2, oral: 1, other: 1 };

export interface Grade {
  id: string;
  subject: string;
  label: string;
  value: number;
  kind: GradeKind;
  weight: number;
  date: string;
  note?: string;
}

/** Weighted average, or null if there is nothing to average. */
export function average(grades: Pick<Grade, 'value' | 'weight'>[]): number | null {
  let sum = 0;
  let weights = 0;
  for (const g of grades) {
    if (!(g.weight > 0)) continue;
    sum += g.value * g.weight;
    weights += g.weight;
  }
  return weights > 0 ? sum / weights : null;
}

/** Average of the per-subject averages, so a subject with many grades does not dominate. */
export function overallAverage(bySubject: Map<string, Grade[]>): number | null {
  const avgs = [...bySubject.values()].map(average).filter((a): a is number => a != null);
  return avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
}

export function formatAverage(value: number | null, scale: Scale): string {
  return value == null ? '–' : value.toFixed(scale.digits);
}
