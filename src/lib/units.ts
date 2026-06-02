export const BAG_KG = 70;

export const toBagEquivalent = (quantity: number, unit: string): number => {
  const u = (unit || '').toLowerCase();
  if (u === '50kg' || u === '50kg bags') return quantity * (50 / 70);
  if (u === '40kg' || u === '40kg bags') return quantity * (40 / 70);
  if (u === 'kg' || u === 'kgs') return quantity / 70;
  return quantity; // bags
};

export const toKg = (quantity: number, unit: string): number => {
  const u = (unit || '').toLowerCase();
  if (u === '50kg' || u === '50kg bags') return quantity * 50;
  if (u === '40kg' || u === '40kg bags') return quantity * 40;
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
  { key: '40kg', label: '40kg', matches: (u) => /^(40kg|40kg bags?)$/i.test(u || '') },
  { key: '20kg', label: '20kg', matches: (u) => /^(20kg|20kg bags?)$/i.test(u || '') },
  { key: '10kg', label: '10kg', matches: (u) => /^(10kg|10kg bags?)$/i.test(u || '') },
  { key: 'kg',   label: 'kg',   matches: (u) => /^(kg|kgs)$/i.test(u || '') },
];

export const canonicalUnitKey = (u: string): string | null => {
  const found = PIVOT_UNITS.find(p => p.matches(u));
  return found?.key || null;
};

/** Canonical DB unit value used when writing a price for a given pivot key. */
export const dbUnitForKey = (key: string): string => {
  if (key === '70kg') return 'bags';
  if (key === 'kg') return 'kg';
  return key; // 50kg, 40kg, 20kg, 10kg
};

export interface PriceRow { product: string; unit: string; price: number | string; }

/**
 * Returns the effective unit price for (product, unitKey).
 * - explicit price wins
 * - kg derives from 10kg / 10
 * - 10kg derives from kg * 10
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
  if (unitKey === 'kg') {
    const ten = findByKey('10kg');
    if (ten && Number(ten.price) > 0) return { value: Number(ten.price) / 10, derived: true };
  }
  if (unitKey === '10kg') {
    const kg = findByKey('kg');
    if (kg && Number(kg.price) > 0) return { value: Number(kg.price) * 10, derived: true };
  }
  return null;
};