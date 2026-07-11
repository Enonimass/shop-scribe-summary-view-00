import React, { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { canonicalUnitKey, dbUnitForKey, toBagEquivalent, formatBags } from '@/lib/units';

export interface WeeklyGridProps {
  /** Inclusive list of ISO dates (YYYY-MM-DD), one per column (usually 7). */
  days: string[];
  /** Sales_items rows joined with their transaction sale_date. */
  rows: { product: string; unit: string; quantity: number; unit_price?: number | null; sale_date: string }[];
  mode: 'bags' | 'money';
  title: string;
}

const shortDay = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
};

/**
 * Pivots rows into a products (rows) × days (columns) grid.
 * `mode='bags'` uses bag-equivalents; `mode='money'` uses qty × unit_price.
 * Cell background intensity scales with the row's peak value so hot cells
 * pop at a glance while keeping a low-noise base.
 */
const WeeklyGrid: React.FC<WeeklyGridProps> = ({ days, rows, mode, title }) => {
  const pivot = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    rows.forEach(r => {
      const value = mode === 'bags'
        ? toBagEquivalent(Number(r.quantity || 0), r.unit)
        : Number(r.quantity || 0) * Number(r.unit_price || 0);
      if (!value) return;
      const bucket = map.get(r.product) || {};
      bucket[r.sale_date] = (bucket[r.sale_date] || 0) + value;
      map.set(r.product, bucket);
    });
    const products = [...map.entries()]
      .map(([product, byDay]) => {
        const total = days.reduce((s, d) => s + (byDay[d] || 0), 0);
        return { product, byDay, total };
      })
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total);
    const colTotals: Record<string, number> = {};
    days.forEach(d => { colTotals[d] = products.reduce((s, r) => s + (r.byDay[d] || 0), 0); });
    const grand = products.reduce((s, r) => s + r.total, 0);
    return { products, colTotals, grand };
  }, [rows, days, mode]);

  const fmt = (n: number) => {
    if (!n) return '';
    return mode === 'bags' ? formatBags(n) : Math.round(n).toLocaleString();
  };

  const cellShade = (v: number, rowPeak: number) => {
    if (!v || !rowPeak) return '';
    const ratio = v / rowPeak;
    if (ratio > 0.85) return 'bg-primary/40 text-primary-foreground font-semibold';
    if (ratio > 0.6)  return 'bg-primary/25 font-semibold';
    if (ratio > 0.35) return 'bg-primary/15';
    return 'bg-primary/5';
  };

  return (
    <div className="overflow-x-auto">
      <div className="text-sm font-semibold mb-2">{title}</div>
      <Table className="text-xs [&_th]:px-2 [&_td]:px-2 [&_th]:py-1.5 [&_td]:py-1.5">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-card z-10">Product</TableHead>
            {days.map(d => (
              <TableHead key={d} className="text-right whitespace-nowrap">{shortDay(d)}</TableHead>
            ))}
            <TableHead className="text-right bg-muted/40">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pivot.products.map(row => {
            const rowPeak = Math.max(...days.map(d => row.byDay[d] || 0));
            return (
              <TableRow key={row.product}>
                <TableCell className="sticky left-0 bg-card font-medium whitespace-nowrap">{row.product}</TableCell>
                {days.map(d => {
                  const v = row.byDay[d] || 0;
                  return (
                    <TableCell key={d} className={cn('text-right tabular-nums', cellShade(v, rowPeak))}>
                      {fmt(v)}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right tabular-nums font-semibold bg-muted/40">{fmt(row.total)}</TableCell>
              </TableRow>
            );
          })}
          {!pivot.products.length && (
            <TableRow><TableCell colSpan={days.length + 2} className="text-center text-muted-foreground">No sales in this range.</TableCell></TableRow>
          )}
          {pivot.products.length > 0 && (
            <TableRow className="bg-muted/60 font-semibold">
              <TableCell className="sticky left-0 bg-muted/60">Total</TableCell>
              {days.map(d => (
                <TableCell key={d} className="text-right tabular-nums">{fmt(pivot.colTotals[d])}</TableCell>
              ))}
              <TableCell className="text-right tabular-nums">{fmt(pivot.grand)}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default WeeklyGrid;