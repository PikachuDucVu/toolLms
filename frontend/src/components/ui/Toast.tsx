import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { X } from 'lucide-react';

type Toast = { id: number; message: string; kind: 'info' | 'success' | 'error' };
const ToastContext = createContext<{ show: (message: string, kind?: Toast['kind']) => void }>({ show: () => undefined });
export function useToast() { return useContext(ToastContext); }
export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<Toast[]>([]);
  const show = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random(); setItems((old) => [...old, { id, message, kind }]);
    window.setTimeout(() => setItems((old) => old.filter((item) => item.id !== id)), 4_000);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return <ToastContext.Provider value={value}>{children}<div aria-live="polite" aria-atomic="false" className="fixed right-4 top-4 z-50 grid gap-2" data-testid="toast-region">{items.map((item) => <div key={item.id} role="status" className={`toast toast-${item.kind}`}><span>{item.message}</span><button aria-label="Đóng thông báo" onClick={() => setItems((old) => old.filter((x) => x.id !== item.id))}><X size={16} /></button></div>)}</div></ToastContext.Provider>;
}
