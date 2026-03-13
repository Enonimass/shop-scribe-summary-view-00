import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface ExportData {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  summary?: Record<string, string | number>;
}

// CSV Export
export const exportToCSV = (data: ExportData, filename: string) => {
  const csvRows: string[] = [];
  
  // Title
  csvRows.push(data.title);
  csvRows.push('');
  
  // Summary if provided
  if (data.summary) {
    Object.entries(data.summary).forEach(([key, value]) => {
      csvRows.push(`${key},${value}`);
    });
    csvRows.push('');
  }
  
  // Headers
  csvRows.push(data.headers.map(h => `"${h}"`).join(','));
  
  // Rows
  data.rows.forEach(row => {
    csvRows.push(row.map(cell => {
      const cellStr = String(cell ?? '');
      return cellStr.includes(',') || cellStr.includes('"') ? `"${cellStr.replace(/"/g, '""')}"` : cellStr;
    }).join(','));
  });
  
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
};

// Excel Export
export const exportToExcel = (data: ExportData, filename: string) => {
  const wb = XLSX.utils.book_new();
  
  const wsData: (string | number)[][] = [];
  
  // Title row
  wsData.push([data.title]);
  wsData.push([]);
  
  // Summary
  if (data.summary) {
    Object.entries(data.summary).forEach(([key, value]) => {
      wsData.push([key, value]);
    });
    wsData.push([]);
  }
  
  // Headers + data
  wsData.push(data.headers);
  data.rows.forEach(row => wsData.push(row));
  
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Auto-width columns
  const colWidths = data.headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...data.rows.map(r => String(r[i] ?? '').length)
    );
    return { wch: Math.min(maxLen + 2, 40) };
  });
  ws['!cols'] = colWidths;
  
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

// PDF Export
export const exportToPDF = (data: ExportData, filename: string) => {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(data.title, 14, 20);
  
  // Date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 14, 28);
  
  let startY = 35;
  
  // Summary
  if (data.summary) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 14, startY);
    startY += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    Object.entries(data.summary).forEach(([key, value]) => {
      doc.text(`${key}: ${value}`, 14, startY);
      startY += 6;
    });
    startY += 5;
  }
  
  // Table
  autoTable(doc, {
    head: [data.headers],
    body: data.rows.map(row => row.map(cell => String(cell ?? ''))),
    startY,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { top: 10 },
  });
  
  doc.save(`${filename}.pdf`);
};

// Multi-sheet Excel export
export const exportMultiSheetExcel = (sheets: { name: string; data: ExportData }[], filename: string) => {
  const wb = XLSX.utils.book_new();
  
  sheets.forEach(({ name, data }) => {
    const wsData: (string | number)[][] = [];
    wsData.push([data.title]);
    wsData.push([]);
    if (data.summary) {
      Object.entries(data.summary).forEach(([key, value]) => {
        wsData.push([key, value]);
      });
      wsData.push([]);
    }
    wsData.push(data.headers);
    data.rows.forEach(row => wsData.push(row));
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
