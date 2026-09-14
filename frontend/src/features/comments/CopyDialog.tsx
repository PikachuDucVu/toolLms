import { useEffect, useRef } from 'react';
import { Dialog } from '../../components/ui/Dialog';

export function CopyDialog({ open, title, text, onClose, onCopied }: { open: boolean; title: string; text: string; onClose: () => void; onCopied: () => void }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.select(); textarea.current?.setSelectionRange(0, text.length); });
  }, [open, text]);
  const copy = () => {
    const input = textarea.current;
    if (!input) return;
    input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
    try {
      if (document.execCommand('copy')) { onCopied(); onClose(); }
    } catch { /* text remains selected for manual copy */ }
  };
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }} title={title}>
    <p className="dialog-description">Nếu trình duyệt không cho phép sao chép tự động, hãy chọn nội dung bên dưới và sao chép thủ công.</p>
    <textarea ref={textarea} className="form-input copy-dialog-text" rows={12} value={text} readOnly aria-label="Nội dung cần sao chép" />
    <div className="dialog-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button><button type="button" className="btn btn-primary" onClick={copy}>Sao chép</button></div>
  </Dialog>;
}
