import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type ReceiptFormat = 'a4' | 'thermal';

const FORMAT_KEY = 'kimp.receipt.format';
export const getPreferredFormat = (): ReceiptFormat =>
  (typeof window !== 'undefined' && (localStorage.getItem(FORMAT_KEY) as ReceiptFormat)) || 'a4';
export const setPreferredFormat = (f: ReceiptFormat) => {
  if (typeof window !== 'undefined') localStorage.setItem(FORMAT_KEY, f);
};

const KES = (n: number) => `KES ${Math.round(Number(n || 0)).toLocaleString()}`;
const shortNo = (id: string) => (id || '').replace(/-/g, '').slice(0, 8).toUpperCase();

export interface InvoiceLine { product: string; quantity: number; unit: string; unit_price: number; line_total: number; }
export interface CreditInvoice {
  shopName: string;
  invoiceNo: string;
  date: string; // YYYY-MM-DD
  dueDate?: string | null;
  customerName: string;
  items: InvoiceLine[];
  total: number;
  paid: number;
  balance: number;
  servedBy?: string;
}
export interface PaymentReceipt {
  shopName: string;
  receiptNo: string;
  date: string;
  customerName: string;
  saleNo: string;
  saleTotal: number;
  amountPaidNow: number;
  totalPaidToDate: number;
  outstanding: number;
  method?: string;
  recordedBy?: string;
}

const openOrSave = (doc: jsPDF, filename: string) => {
  doc.save(filename);
  try { window.open(doc.output('bloburl'), '_blank'); } catch { /* ignore */ }
};

// ---------- Credit Invoice ----------

export const printCreditInvoice = (inv: CreditInvoice, format: ReceiptFormat = getPreferredFormat()) => {
  if (format === 'thermal') return thermalInvoice(inv);
  return a4Invoice(inv);
};

const a4Invoice = (inv: CreditInvoice) => {
  const doc = new jsPDF();
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(inv.shopName || 'Kimp Feeds', 14, 18);
  doc.setFontSize(12); doc.text('CREDIT INVOICE', 14, 26);

  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Invoice #: ${shortNo(inv.invoiceNo)}`, 140, 18);
  doc.text(`Date: ${inv.date}`, 140, 24);
  if (inv.dueDate) doc.text(`Due: ${inv.dueDate}`, 140, 30);

  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Bill to:', 14, 38);
  doc.setFont('helvetica', 'normal'); doc.text(inv.customerName || '-', 32, 38);

  autoTable(doc, {
    head: [['Product', 'Qty', 'Unit', 'Unit Price', 'Total']],
    body: inv.items.map(i => [i.product, String(i.quantity), i.unit, KES(i.unit_price), KES(i.line_total)]),
    startY: 44,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: 'bold' },
  });

  const y = (doc as any).lastAutoTable.finalY + 6;
  doc.setFontSize(11);
  doc.text(`Total: ${KES(inv.total)}`, 140, y);
  doc.text(`Paid: ${KES(inv.paid)}`, 140, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(`Credit balance: ${KES(inv.balance)}`, 140, y + 14);
  doc.setFont('helvetica', 'normal');
  if (inv.dueDate) doc.text(`Payment due: ${inv.dueDate}`, 140, y + 22);

  doc.text('Customer signature: ____________________', 14, y + 36);
  doc.text(`Served by: ${inv.servedBy || '____________________'}`, 14, y + 46);
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text('This document acknowledges goods received on credit and the buyer\'s undertaking to pay by the due date.', 14, y + 56);

  openOrSave(doc, `credit-invoice-${shortNo(inv.invoiceNo)}.pdf`);
};

const thermalInvoice = (inv: CreditInvoice) => {
  // 80mm wide, dynamic height
  const W = 80;
  const lines = 14 + inv.items.length * 2 + (inv.dueDate ? 1 : 0);
  const H = Math.max(110, 40 + lines * 4);
  const doc = new jsPDF({ unit: 'mm', format: [W, H] });
  doc.setFont('courier', 'normal'); doc.setFontSize(10);
  let y = 6;
  const line = (t: string, bold = false) => { doc.setFont('courier', bold ? 'bold' : 'normal'); doc.text(t, 4, y); y += 4; };
  line(inv.shopName || 'Kimp Feeds', true);
  line('CREDIT INVOICE', true);
  line(`No: ${shortNo(inv.invoiceNo)}`);
  line(`Date: ${inv.date}`);
  if (inv.dueDate) line(`Due:  ${inv.dueDate}`);
  line(`Cust: ${inv.customerName}`);
  line('--------------------------------');
  inv.items.forEach(i => {
    line(`${i.product}`.slice(0, 30));
    line(`  ${i.quantity} ${i.unit} x ${KES(i.unit_price)} = ${KES(i.line_total)}`);
  });
  line('--------------------------------');
  line(`TOTAL: ${KES(inv.total)}`, true);
  line(`Paid : ${KES(inv.paid)}`);
  line(`OWED : ${KES(inv.balance)}`, true);
  if (inv.dueDate) line(`DUE  : ${inv.dueDate}`, true);
  line('');
  line('Customer signature:');
  line('_______________________');
  openOrSave(doc, `credit-invoice-${shortNo(inv.invoiceNo)}.pdf`);
};

// ---------- Payment Receipt ----------

export const printPaymentReceipt = (r: PaymentReceipt, format: ReceiptFormat = getPreferredFormat()) => {
  if (format === 'thermal') return thermalReceipt(r);
  return a4Receipt(r);
};

const a4Receipt = (r: PaymentReceipt) => {
  const doc = new jsPDF();
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(r.shopName || 'Kimp Feeds', 14, 18);
  doc.setFontSize(12); doc.text('DEBT PAYMENT RECEIPT', 14, 26);

  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Receipt #: ${shortNo(r.receiptNo)}`, 140, 18);
  doc.text(`Date: ${r.date}`, 140, 24);

  doc.setFont('helvetica', 'bold'); doc.text('Received from:', 14, 38);
  doc.setFont('helvetica', 'normal'); doc.text(r.customerName || '-', 50, 38);

  autoTable(doc, {
    head: [['Detail', 'Amount']],
    body: [
      ['Linked sale #', shortNo(r.saleNo)],
      ['Original total', KES(r.saleTotal)],
      ['Amount paid now', KES(r.amountPaidNow)],
      ['Total paid to date', KES(r.totalPaidToDate)],
      ['Outstanding balance', KES(r.outstanding)],
      ['Method', r.method || '-'],
    ],
    startY: 44, styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [34, 139, 34], textColor: 255 },
  });

  const y = (doc as any).lastAutoTable.finalY + 12;
  doc.text(`Received by: ${r.recordedBy || '____________________'}`, 14, y);
  doc.text('Customer signature: ____________________', 14, y + 10);

  openOrSave(doc, `payment-receipt-${shortNo(r.receiptNo)}.pdf`);
};

const thermalReceipt = (r: PaymentReceipt) => {
  const W = 80, H = 130;
  const doc = new jsPDF({ unit: 'mm', format: [W, H] });
  doc.setFont('courier', 'normal'); doc.setFontSize(10);
  let y = 6;
  const line = (t: string, bold = false) => { doc.setFont('courier', bold ? 'bold' : 'normal'); doc.text(t, 4, y); y += 4; };
  line(r.shopName || 'Kimp Feeds', true);
  line('PAYMENT RECEIPT', true);
  line(`No:   ${shortNo(r.receiptNo)}`);
  line(`Date: ${r.date}`);
  line(`Cust: ${r.customerName}`);
  line('--------------------------------');
  line(`Sale: ${shortNo(r.saleNo)}`);
  line(`Sale total : ${KES(r.saleTotal)}`);
  line(`Paid now   : ${KES(r.amountPaidNow)}`, true);
  line(`Paid total : ${KES(r.totalPaidToDate)}`);
  line(`OUTSTANDING: ${KES(r.outstanding)}`, true);
  line(`Method: ${r.method || '-'}`);
  line('');
  line('Customer signature:');
  line('_______________________');
  openOrSave(doc, `payment-receipt-${shortNo(r.receiptNo)}.pdf`);
};