import { Settings, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../app/providers';
import { ConfigurationForm } from './ConfigurationForm';

export function ConfigPanel() {
  const [open, setOpen] = useState(false);
  const auth = useAuth();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      {open && (
        <div
          className="settings-panel-overlay"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        id="settings-panel"
        className="settings-panel"
        hidden={!open}
        role="dialog"
        aria-labelledby="settings-panel-title"
        aria-modal={open}
      >
        <header className="settings-panel-header">
          <div>
            <h2 id="settings-panel-title">Cấu hình</h2>
            <p>Tùy chỉnh phong cách nhận xét, tiêu chí đánh giá và cài đặt AI</p>
          </div>
          <button
            type="button"
            className="dialog-close settings-panel-close"
            aria-label="Đóng cấu hình"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </header>
        <ConfigurationForm key={auth.session?.email || 'signed-out'} />
      </aside>
      <button
        type="button"
        className={`settings-fab${open ? ' is-open' : ''}`}
        aria-label="Cấu hình"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="settings-panel"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={22} /> : <Settings size={22} />}
      </button>
    </>
  );
}
