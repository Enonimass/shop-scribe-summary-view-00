import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Round any numeric value to 2 decimal places (never returns -0). */
export function round2(n: number | string | null | undefined): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const r = Math.round((v + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r;
}

/** Round to 2dp and clamp negatives to 0. */
export function round2NonNegative(n: number | string | null | undefined): number {
  return Math.max(0, round2(n));
}

/** Normalise any name (product, customer) to trimmed UPPERCASE. */
export function upper(s: string | null | undefined): string {
  return (s || '').trim().toUpperCase();
}

/** Display a number with at most 2 decimals. */
export function fmt2(n: number | string | null | undefined): string {
  const r = round2(n);
  return r % 1 === 0 ? r.toString() : r.toFixed(2);
}
