import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText, FileDown } from 'lucide-react';
import { exportToCSV, exportToExcel, exportToPDF } from '@/lib/exportUtils';
import { toast } from '@/hooks/use-toast';

interface ExportData {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  summary?: Record<string, string | number>;
}

interface ExportButtonsProps {
  getData: () => ExportData;
  filename: string;
}

const ExportButtons: React.FC<ExportButtonsProps> = ({ getData, filename }) => {
  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    try {
      const data = getData();
      if (data.rows.length === 0) {
        toast({ title: 'No Data', description: 'No data available to export', variant: 'destructive' });
        return;
      }
      switch (format) {
        case 'csv': exportToCSV(data, filename); break;
        case 'excel': exportToExcel(data, filename); break;
        case 'pdf': exportToPDF(data, filename); break;
      }
      toast({ title: 'Export Complete', description: `${data.title} exported as ${format.toUpperCase()}` });
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: 'Export Failed', description: 'Failed to export data', variant: 'destructive' });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('csv')} className="flex items-center gap-2 cursor-pointer">
          <FileText className="h-4 w-4" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('excel')} className="flex items-center gap-2 cursor-pointer">
          <FileSpreadsheet className="h-4 w-4" />
          Export as Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('pdf')} className="flex items-center gap-2 cursor-pointer">
          <FileDown className="h-4 w-4" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ExportButtons;
