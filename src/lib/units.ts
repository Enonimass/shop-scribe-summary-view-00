export const BAG_KG = 70;

export const toBagEquivalent = (quantity: number, unit: string): number => {
  const u = (unit || '').toLowerCase();
  if (u === '50kg' || u === '50kg bags') return quantity * (50 / 70);
  if (u === '5kg' || u === '5kg bags') return quantity * (5 / 70);
  if (u === '20kg' || u === '20kg bags') return quantity * (20 / 70);
  if (u === '10kg' || u === '10kg bags') return quantity * (10 / 70);
  if (u === 'kg' || u === 'kgs') return quantity / 70;
  return quantity; // bags
};

export const toKg = (quantity: number, unit: string): number => {
  const u = (unit || '').toLowerCase();
  if (u === '50kg' || u === '50kg bags') return quantity * 50;
  if (u === '5kg' || u === '5kg bags') return quantity * 5;
  if (u === '20kg' || u === '20kg bags') return quantity * 20;
  if (u === '10kg' || u === '10kg bags') return quantity * 10;
  if (u === 'kg' || u === 'kgs') return quantity;
  return quantity * 70; // bags
};

export const formatBags = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return r % 1 === 0 ? r.toString() : r.toFixed(2);
};

export const formatTonnes = (kg: number) => {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  return `${Math.round(kg)} kg`;
};

/** Canonical unit columns (label → matching strings stored in DB). */
export const PIVOT_UNITS: { key: string; label: string; matches: (u: string) => boolean }[] = [
  { key: '70kg', label: '70kg', matches: (u) => /^(bags?|70kg|70kg bags?)$/i.test(u || '') },
  { key: '50kg', label: '50kg', matches: (u) => /^(50kg|50kg bags?)$/i.test(u || '') },
  { key: '20kg', label: '20kg', matches: (u) => /^(20kg|20kg bags?)$/i.test(u || '') },
  { key: '10kg', label: '10kg', matches: (u) => /^(10kg|10kg bags?)$/i.test(u || '') },
  { key: '5kg', label: '5kg', matches: (u) => /^(5kg|5kg bags?)$/i.test(u || '') },
  { key: 'kg',   label: 'kg',   matches: (u) => /^(kg|kgs)$/i.test(u || '') },
];

/** kg-weight per one unit of each pivot key. */
export const KG_PER_UNIT_KEY: Record<string, number> = {
  '70kg': 70, '50kg': 50, '20kg': 20, '10kg': 10, 'kg': 1,
  '5kg': 5,
};

export const canonicalUnitKey = (u: string): string | null => {
  const found = PIVOT_UNITS.find(p => p.matches(u));
  return found?.key || null;
};

/** Canonical DB unit value used when writing a price for a given pivot key. */
export const dbUnitForKey = (key: string): string => {
  if (key === '70kg') return 'bags';
  if (key === 'kg') return 'kg';
  return key; // 50kg, 20kg, 10kg
};

/**
 * Canonical list of units the app accepts everywhere the user can pick a unit.
 * All writes should use one of these values so the DB never accumulates
 * case-duplicated columns like `bags`, `Bags`, `BAGS`.
 */
export const CANONICAL_UNITS: { value: string; label: string }[] = [
  { value: 'bags', label: 'Bags (70kg)' },
  { value: '50kg', label: '50 kg' },
  { value: '20kg', label: '20 kg' },
  { value: '10kg', label: '10 kg' },
  { value: '5kg',  label: '5 kg' },
  { value: 'kg',   label: 'kg' },
];

/** Normalize any user-typed / legacy unit string to a canonical DB value. */
export const normalizeUnit = (u: string): string => {
  const key = canonicalUnitKey(u);
  if (key) return dbUnitForKey(key);
  return (u || '').trim();
};

export interface PriceRow { product: string; unit: string; price: number | string; }

/**
 * Returns the effective unit price for (product, unitKey).
 * - explicit price wins
 * - any pack price derives from per-kg price × pack size
 * - per-kg derives from any pack price / pack size (smallest pack preferred)
 */
export const getEffectiveUnitPrice = (
  prices: PriceRow[],
  product: string,
  unitKey: string,
): { value: number; derived: boolean } | null => {
  const findByKey = (k: string) =>
    prices.find(p => p.product === product && canonicalUnitKey(p.unit) === k);
  const explicit = findByKey(unitKey);
  if (explicit && Number(explicit.price) > 0) return { value: Number(explicit.price), derived: false };
  const size = KG_PER_UNIT_KEY[unitKey];
  if (!size) return null;
  // Derive pack from per-kg
  if (unitKey !== 'kg') {
    const kg = findByKey('kg');
    if (kg && Number(kg.price) > 0) return { value: Number(kg.price) * size, derived: true };
  }
  // Derive per-kg from smallest available pack
  if (unitKey === 'kg') {
    const candidates = ['10kg', '20kg', '50kg', '70kg']
      .map(k => ({ k, row: findByKey(k), size: KG_PER_UNIT_KEY[k] }))
      .filter(c => c.row && Number(c.row!.price) > 0);
    // prefer the smallest pack available (5kg first if present)
    if (KG_PER_UNIT_KEY['5kg']) {
      const with5 = ['5kg', '10kg', '20kg', '50kg', '70kg']
        .map(k => ({ k, row: findByKey(k), size: KG_PER_UNIT_KEY[k] }))
        .filter(c => c.row && Number(c.row!.price) > 0);
      if (with5.length) return { value: Number(with5[0].row!.price) / with5[0].size, derived: true };
    }
    if (candidates.length) {
      const best = candidates[0];
      return { value: Number(best.row!.price) / best.size, derived: true };
    }
  }
  return null;
};