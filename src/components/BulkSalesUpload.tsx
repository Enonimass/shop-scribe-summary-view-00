import React, { useState, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileSpreadsheet, Check, AlertTriangle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface BulkSalesUploadProps {
  shopId: string;
  onUploadComplete?: () => void;
}

interface ParsedRow {
  date: string;
  customer_name: string;
  product: string;
  quantity: number;
  unit: string;
  valid: boolean;
  error?: string;
}

const BulkSalesUpload: React.FC<BulkSalesUploadProps> = ({ shopId, onUploadComplete }) => {
  const [open, setOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const PRODUCT_ALIASES: Record<string, string> = {
    'hydm': 'High yield dairy meal', 'high yield': 'High yield dairy meal',
    'dm': 'Dairy meal', 'dairy': 'Dairy meal',
    'lm': 'Layers mash', 'layers': 'Layers mash',
    'gm': 'Growers mash', 'growers': 'Growers mash',
    'km': 'Kienyeji mash', 'kienyeji': 'Kienyeji mash',
    'pg': 'Pig grower', 'pig': 'Pig grower',
    'sw': 'Sow weaner', 'sow': 'Sow weaner',
    'mg': 'Maize germ', 'maize': 'Maize germ',
    'bran': 'Wheat Bran', 'wheat bran': 'Wheat Bran',
    'polland': 'Polland', 'poll': 'Polland',
    'bs': 'Broiler starter', 'bf': 'Broiler finisher',
    'cs': 'Calf starter', 'dp': 'Dairy Pellets',
  };

  const resolveProduct = (raw: string): string => {
    const lower = raw.trim().toLowerCase();
    return PRODUCT_ALIASES[lower] || raw.trim();
  };

  const resolveUnit = (raw: string, qty: number): string => {
    const lower = raw.trim().toLowerCase();
    if (lower.includes('50')) return '50kg';
    if (lower.includes('35')) return '35kg';
    if (lower.includes('10')) return '10kg';
    if (lower.includes('bag') || lower.includes('70') || lower === 'bags') return 'Bags';
    if (qty === 0.5) return 'Bags'; // half bag
    return raw.trim() || 'Bags';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

      // Find header row
      let headerIdx = -1;
      for (let i = 0; i < Math.min(json.length, 10); i++) {
        const row = json[i].map((c: any) => String(c).toLowerCase());
        if (row.some(c => c.includes('date')) && row.some(c => c.includes('customer') || c.includes('name'))) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        // Try auto-detect: assume columns are Date, Customer, Product, Quantity, Unit
        headerIdx = 0;
      }

      const headers = json[headerIdx].map((h: any) => String(h).toLowerCase().trim());
      const dateCol = headers.findIndex(h => h.includes('date'));
      const customerCol = headers.findIndex(h => h.includes('customer') || h.includes('name'));
      const productCol = headers.findIndex(h => h.includes('product') || h.includes('item') || h.includes('feed'));
      const quantityCol = headers.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('amount'));
      const unitCol = headers.findIndex(h => h.includes('unit') || h.includes('size') || h.includes('kg'));

      const rows: ParsedRow[] = [];
      for (let i = headerIdx + 1; i < json.length; i++) {
        const row = json[i];
        if (!row || row.every((c: any) => !c && c !== 0)) continue;

        const rawDate = row[dateCol >= 0 ? dateCol : 0];
        const rawCustomer = String(row[customerCol >= 0 ? customerCol : 1] || '').trim();
        const rawProduct = String(row[productCol >= 0 ? productCol : 2] || '').trim();
        const rawQty = Number(row[quantityCol >= 0 ? quantityCol : 3]) || 0;
        const rawUnit = String(row[unitCol >= 0 ? unitCol : 4] || 'Bags').trim();

        if (!rawCustomer && !rawProduct) continue;

        let dateStr = '';
        if (rawDate instanceof Date) {
          dateStr = rawDate.toISOString().split('T')[0];
        } else if (typeof rawDate === 'number') {
          // Excel serial date
          const d = XLSX.SSF.parse_date_code(rawDate);
          dateStr = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        } else {
          dateStr = String(rawDate).trim();
          // Parse dd/mm/yyyy or mm/dd/yyyy formats manually to avoid timezone issues
          const slashMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
          if (slashMatch) {
            const [, a, b, y] = slashMatch;
            // Assume dd/mm/yyyy format (common in Kenya)
            const day = a.padStart(2, '0');
            const month = b.padStart(2, '0');
            dateStr = `${y}-${month}-${day}`;
          } else {
            // Fallback: try parsing but use local date parts to avoid timezone shift
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
              dateStr = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
            }
          }
        }

        const product = resolveProduct(rawProduct);
        const unit = resolveUnit(rawUnit, rawQty);
        const valid = !!dateStr && !!rawCustomer && !!product && rawQty > 0;
        const error = !valid ? 
          (!dateStr ? 'Missing date' : !rawCustomer ? 'Missing customer' : !product ? 'Missing product' : 'Invalid quantity') 
          : undefined;

        rows.push({ date: dateStr, customer_name: rawCustomer, product, quantity: rawQty, unit, valid, error });
      }

      setParsedRows(rows);
      setOpen(true);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to parse file. Ensure it has columns: Date, Customer, Product, Quantity, Unit', variant: 'destructive' });
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    const validRows = parsedRows.filter(r => r.valid);
    if (validRows.length === 0) {
      toast({ title: 'No valid rows', description: 'Fix errors before uploading', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      // Group by date + customer for transactions
      const txMap: Record<string, ParsedRow[]> = {};
      validRows.forEach(row => {
        const key = `${row.date}_${row.customer_name}`;
        if (!txMap[key]) txMap[key] = [];
        txMap[key].push(row);
      });

      let insertedCount = 0;
      for (const [key, items] of Object.entries(txMap)) {
        const { date, customer_name } = items[0];
        
        const { data: tx, error: txErr } = await supabase.from('sales_transactions').insert({
          customer_name,
          shop_id: shopId,
          sale_date: date,
        } as any).select().single();

        if (txErr || !tx) continue;

        const salesItems = items.map(item => ({
          transaction_id: tx.id,
          product: item.product,
          quantity: item.quantity,
          unit: item.unit,
        }));

        await supabase.from('sales_items').insert(salesItems as any);
        insertedCount += items.length;

        // Update inventory
        for (const item of items) {
          const { data: inv } = await supabase.from('inventory')
            .select('*')
            .eq('shop_id', shopId)
            .ilike('product', item.product)
            .single();

          if (inv) {
            await supabase.from('inventory')
              .update({ quantity: Math.max(0, (inv as any).quantity - item.quantity) } as any)
              .eq('id', (inv as any).id);
          }
        }
      }

      toast({ title: 'Upload Complete', description: `${insertedCount} sales records imported from ${Object.keys(txMap).length} transactions` });
      setOpen(false);
      setParsedRows([]);
      onUploadComplete?.();
    } catch (err) {
      toast({ title: 'Upload Failed', description: 'An error occurred during upload', variant: 'destructive' });
    }
    setUploading(false);
  };

  const validCount = parsedRows.filter(r => r.valid).length;
  const errorCount = parsedRows.filter(r => !r.valid).length;

  return (
    <>
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Upload Sales File
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Preview: {fileName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-3 mb-4">
            <Badge className="bg-green-600 text-white"><Check className="h-3 w-3 mr-1" />{validCount} valid</Badge>
            {errorCount > 0 && <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />{errorCount} errors</Badge>}
          </div>

          <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedRows.map((row, i) => (
                  <TableRow key={i} className={!row.valid ? 'bg-destructive/10' : ''}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.customer_name}</TableCell>
                    <TableCell>{row.product}</TableCell>
                    <TableCell>{row.quantity}</TableCell>
                    <TableCell>{row.unit}</TableCell>
                    <TableCell>
                      {row.valid ? (
                        <Badge className="bg-green-600 text-white">OK</Badge>
                      ) : (
                        <Badge variant="destructive">{row.error}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || validCount === 0}>
              {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</> : `Import ${validCount} Records`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BulkSalesUpload;
