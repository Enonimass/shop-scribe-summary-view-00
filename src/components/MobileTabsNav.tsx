import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export interface MobileTabItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface Props {
  items: MobileTabItem[];
  value: string;
  onChange: (v: string) => void;
  /** If provided, also rendered on desktop. Otherwise only rendered on mobile. */
  desktopFallback?: React.ReactNode;
}

const MobileTabsNav: React.FC<Props> = ({ items, value, onChange, desktopFallback }) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const current = items.find(i => i.value === value) || items[0];

  if (!isMobile) return <>{desktopFallback}</>;

  return (
    <div className="flex items-center gap-2 mb-3 sticky top-0 z-10 bg-background/95 backdrop-blur py-2">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="shrink-0">
            <Menu className="h-4 w-4 mr-2" /> Menu
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <nav className="p-2 overflow-y-auto h-full">
            {items.map(it => (
              <button
                key={it.value}
                onClick={() => { onChange(it.value); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm',
                  value === it.value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/60 flex-1 overflow-hidden">
        {current?.icon}
        <span className="font-medium text-sm truncate">{current?.label}</span>
      </div>
    </div>
  );
};

export default MobileTabsNav;