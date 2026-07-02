import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Factory } from 'lucide-react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const startOfWeek = (d: Date) => {
  const nd = new Date(d);
  const day = (nd.getDay() + 6) % 7; // Mon = 0
  nd.setDate(nd.getDate() - day);
  nd.setHours(0, 0, 0, 0);
  return nd;
};

const ProductionIntakeWeekly: React.FC = () => {
  const [anchor, setAnchor] = useState<Date>(() => startOfWeek(new Date()));
  const [intake, setIntake] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [factory, setFactory] = useState<any[]>([]);

  const weekStart = anchor;
  const weekEnd = new Date(anchor); weekEnd.setDate(weekEnd.getDate() + 6);
  const startStr = weekStart.toISOString().split('T')[0];
  const endStr = weekEnd.toISOString().split('T')[0];

  useEffect(() => {
    (async () => {
      const { data: ins } = await supabase.from('factory_intake_log').select('*').gte('intake_date', startStr).lte('intake_date', endStr);
      const { data: dn } = await supabase.from('delivery_notes').select('*, delivery_note_items(*)').gte('delivery_date', startStr).lte('delivery_date', endStr).eq('status', 'added_to_inventory');
      const { data: fac } = await supabase.from('factory_inventory').select('*');
      setIntake(ins || []); setDeliveries(dn || []); setFactory(fac || []);
    })();
  }, [startStr, endStr]);

  const grid = useMemo(() => {
    const keys = new Set<string>();
    factory.forEach(f => keys.add(`${f.product}|${f.unit}`));
    intake.forEach(i => keys.add(`${i.product}|${i.unit}`));
    deliveries.forEach(d => (d.delivery_note_items || []).forEach((it: any) => keys.add(`${it.product}|${it.unit}`)));

    // current closing = factory today. Roll back day by day.
    const rows = [...keys].map(k => {
      const [product, unit] = k.split('|');
      const currentClosing = factory.filter(f => f.product === product && f.unit === unit).reduce((s, f) => s + Number(f.quantity || 0), 0);

      const perDay = DAYS.map((_, di) => {
        const d = new Date(weekStart); d.setDate(d.getDate() + di);
        const dStr = d.toISOString().split('T')[0];
        const added = intake.filter(i => i.product === product && i.unit === unit && i.intake_date === dStr).reduce((s, i) => s + Number(i.quantity || 0), 0);
        const out = deliveries.filter(dn => dn.delivery_date === dStr).flatMap(dn => dn.delivery_note_items || []).filter((it: any) => it.product === product && it.unit === unit).reduce((s: number, it: any) => s + Number(it.quantity || 0), 0);
        return { added, out };
      });

      // Roll back from currentClosing (which is "now") to end-of-week, then back through each day
      // Post-week added/out (between endOfWeek and today):
      const afterEnd = new Date(weekEnd); afterEnd.setDate(afterEnd.getDate() + 1);
      const afterEndStr = afterEnd.toISOString().split('T')[0];
      const addedAfter = intake.filter(i => i.product === product && i.unit === unit && i.intake_date >= afterEndStr).reduce((s, i) => s + Number(i.quantity || 0), 0);
      const outAfter = deliveries.filter(dn => dn.delivery_date >= afterEndStr).flatMap(dn => dn.delivery_note_items || []).filter((it: any) => it.product === product && it.unit === unit).reduce((s: number, it: any) => s + Number(it.quantity || 0), 0);
      let closingOfDay = currentClosing - addedAfter + outAfter; // = closing at end-of-week (Sun)

      const days = [];
      for (let di = 6; di >= 0; di--) {
        const closing = closingOfDay;
        const opening = closing - perDay[di].added + perDay[di].out;
        days[di] = { ...perDay[di], opening, closing };
        closingOfDay = opening;
      }

      const totalAdded = perDay.reduce((s, d) => s + d.added, 0);
      const totalOut = perDay.reduce((s, d) => s + d.out, 0);
      if (totalAdded === 0 && totalOut === 0 && currentClosing === 0) return null;
      return { product, unit, days, totalAdded, totalOut };
    }).filter(Boolean) as any[];

    return rows.sort((a, b) => a.product.localeCompare(b.product) || a.unit.localeCompare(b.unit));
  }, [factory, intake, deliveries, weekStart, weekEnd]);

  const shiftWeek = (n: number) => {
    const nd = new Date(anchor); nd.setDate(nd.getDate() + n * 7); setAnchor(startOfWeek(nd));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2"><Factory className="h-5 w-5" /> Factory intake — weekly</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => shiftWeek(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="text-sm font-medium">{startStr} → {endStr}</div>
            <Button variant="outline" size="sm" onClick={() => shiftWeek(1)}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(startOfWeek(new Date()))}>This week</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product / Unit</TableHead>
              <TableHead>Row</TableHead>
              {DAYS.map(d => <TableHead key={d} className="text-right">{d}</TableHead>)}
              <TableHead className="text-right">Week</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grid.length === 0 && (
              <TableRow><TableCell colSpan={DAYS.length + 3} className="text-center text-muted-foreground">No movement or stock this week.</TableCell></TableRow>
            )}
            {grid.map(r => (
              <React.Fragment key={`${r.product}|${r.unit}`}>
                <TableRow className="bg-muted/40">
                  <TableCell rowSpan={4} className="font-medium align-top">
                    <div>{r.product}</div>
                    <div className="text-xs text-muted-foreground">{r.unit}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">Opening</TableCell>
                  {r.days.map((d: any, i: number) => <TableCell key={i} className="text-right tabular-nums">{d.opening}</TableCell>)}
                  <TableCell className="text-right tabular-nums">{r.days[0].opening}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs text-green-600">Added</TableCell>
                  {r.days.map((d: any, i: number) => <TableCell key={i} className="text-right tabular-nums text-green-600">{d.added || ''}</TableCell>)}
                  <TableCell className="text-right tabular-nums text-green-600">+{r.totalAdded}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs text-orange-600">Out</TableCell>
                  {r.days.map((d: any, i: number) => <TableCell key={i} className="text-right tabular-nums text-orange-600">{d.out || ''}</TableCell>)}
                  <TableCell className="text-right tabular-nums text-orange-600">-{r.totalOut}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs font-semibold">Closing</TableCell>
                  {r.days.map((d: any, i: number) => <TableCell key={i} className="text-right tabular-nums font-semibold">{d.closing}</TableCell>)}
                  <TableCell className="text-right tabular-nums font-semibold">{r.days[6].closing}</TableCell>
                </TableRow>
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default ProductionIntakeWeekly;