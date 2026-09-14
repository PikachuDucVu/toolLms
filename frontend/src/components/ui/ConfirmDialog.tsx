import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { createContext, useContext, useRef, useState, type PropsWithChildren } from 'react';

type Request = { title: string; description: string; confirmLabel?: string };
const ConfirmContext = createContext<(request: Request) => Promise<boolean>>(async () => false);
export function useConfirm() { return useContext(ConfirmContext); }
export function ConfirmProvider({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<Request | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const finish = (value: boolean) => {
    resolver.current?.(value); resolver.current = null; setRequest(null);
    queueMicrotask(() => returnFocus.current?.focus());
  };
  const confirm = (next: Request) => new Promise<boolean>((resolve) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resolver.current = resolve; setRequest(next);
  });
  return <ConfirmContext.Provider value={confirm}>{children}<AlertDialog.Root open={Boolean(request)} onOpenChange={(open) => { if (!open && request) finish(false); }}><AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay" data-testid="confirm-backdrop" /><AlertDialog.Content className="dialog-content"><AlertDialog.Title className="dialog-title">{request?.title}</AlertDialog.Title><AlertDialog.Description className="dialog-description">{request?.description}</AlertDialog.Description><div className="dialog-actions"><AlertDialog.Cancel className="btn btn-outline" onClick={() => finish(false)}>Hủy</AlertDialog.Cancel><AlertDialog.Action className="btn btn-danger" onClick={() => finish(true)}>{request?.confirmLabel || 'Xác nhận'}</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root></ConfirmContext.Provider>;
}
