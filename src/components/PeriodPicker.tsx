import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface Period { start: Date; end: Date; label: string }

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

export const buildPreset = (preset: string): Period => {
  const now = new Date();
  const today = startOfDay(now);
  switch (preset) {
    case 'today':       return { start: today, end: endOfDay(now), label: 'Today' };
    case 'yesterday': { const y = new Date(today); y.setDate(y.getDate()-1); return { start: y, end: endOfDay(y), label: 'Yesterday' }; }
    case '7d': { const s = new Date(today); s.setDate(s.getDate()-6); return { start: s, end: endOfDay(now), label: 'Last 7 days' }; }
    case 'month':       return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now), label: 'This month' };
    case 'last_month': { const s = new Date(now.getFullYear(), now.getMonth()-1, 1); const e = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)); return { start: s, end: e, label: 'Last month' }; }
    case 'year':        return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(now), label: 'This year' };
    default:            return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now), label: 'This month' };
  }
};

const PRESETS: { key: string; label: string }[] = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: '7d',         label: 'Last 7 days' },
  { key: 'month',      label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'year',       label: 'This year' },
];

interface Props { value: Period; onChange: (p: Period) => void; }

const PeriodPicker: React.FC<Props> = ({ value, onChange }) => {
  const [activePreset, setActivePreset] = useState<string>('month');
  const [custom, setCustom] = useState<boolean>(false);
  const fromStr = useMemo(() => value.start.toISOString().split('T')[0], [value.start]);
  const toStr = useMemo(() => value.end.toISOString().split('T')[0], [value.end]);

  const pickPreset = (k: string) => {
    setActivePreset(k); setCustom(false);
    onChange(buildPreset(k));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(p => (
          <Button key={p.key} size="sm" variant={!custom && activePreset === p.key ? 'default' : 'outline'} onClick={() => pickPreset(p.key)}>
            {p.label}
          </Button>
        ))}
        <Button size="sm" variant={custom ? 'default' : 'outline'} onClick={() => setCustom(true)}>Custom</Button>
      </div>
      {custom && (
        <div className="grid grid-cols-2 gap-2 max-w-md">
          <div><Label className="text-xs">From</Label><Input type="date" value={fromStr} onChange={e => {
            const d = new Date(e.target.value); if (!isNaN(d.getTime())) onChange({ start: startOfDay(d), end: value.end, label: 'Custom' });
          }} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={toStr} onChange={e => {
            const d = new Date(e.target.value); if (!isNaN(d.getTime())) onChange({ start: value.start, end: endOfDay(d), label: 'Custom' });
          }} /></div>
        </div>
      )}
    </div>
  );
};

export default PeriodPicker;