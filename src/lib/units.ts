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