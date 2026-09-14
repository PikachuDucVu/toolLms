import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { PropsWithChildren } from 'react';
import { X } from 'lucide-react';

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  contentClassName,
}: PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  contentClassName?: string;
}>) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className={`dialog-content${contentClassName ? ` ${contentClassName}` : ''}`}>
          <DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close className="dialog-close" aria-label="Đóng">
            <X size={18} />
          </DialogPrimitive.Close>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
