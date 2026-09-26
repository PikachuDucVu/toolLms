import type { StorageProductFile } from "@tool-lms/contracts";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MAX_SELECTED_FILES = 20;

export function StorageProductDialog({
  open,
  anchor,
  studentName,
  files,
  loading = false,
  error = null,
  existingWorkCount = 0,
  locked = false,
  onClose,
  onRetry,
  onSubmit,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  studentName: string;
  files: StorageProductFile[];
  loading?: boolean;
  error?: string | null;
  existingWorkCount?: number;
  locked?: boolean;
  onClose: () => void;
  onRetry?: () => void;
  onSubmit: (files: StorageProductFile[], title: string, comment: string) => Promise<void>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("Sản phẩm cuối khóa");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [box, setBox] = useState<DropdownBox | null>(null);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedFiles = files.filter((file) => selected.has(file.id));

  useEffect(() => {
    if (!open) return;
    setSelectedIds([]);
    setTitle("Sản phẩm cuối khóa");
    setComment("");
    setFormError(null);
    setSaving(false);
  }, [open, studentName]);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const update = () => setBox(placeDropdown(anchor));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchor, files.length]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return;
      if (!saving) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose, open, saving]);

  if (!open || !box) return null;

  const toggle = (fileId: string) => {
    setSelectedIds((current) => {
      if (current.includes(fileId)) return current.filter((id) => id !== fileId);
      if (current.length >= MAX_SELECTED_FILES) return current;
      return [...current, fileId];
    });
  };

  const toggleAll = () => {
    setSelectedIds((current) => current.length ? [] : files.slice(0, MAX_SELECTED_FILES).map((file) => file.id));
  };

  const submit = async () => {
    const cleanTitle = title.trim();
    if (!selectedFiles.length) {
      setFormError("Hãy chọn ít nhất một file.");
      return;
    }
    if (!cleanTitle) {
      setFormError("Vui lòng nhập tên sản phẩm.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSubmit(selectedFiles, cleanTitle, comment.trim());
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Không nộp được sản phẩm lên LMS.");
      setSaving(false);
    }
  };

  return createPortal(
    <div
      ref={panelRef}
      className="storage-product-dropdown"
      role="dialog"
      aria-label={`File sản phẩm của ${studentName}`}
      style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
    >
      <strong className="storage-product-dropdown-title">Chọn file của {studentName}</strong>
      <p className="dialog-description">Chọn một hoặc nhiều file trên kho sản phẩm, rồi nộp lên LMS.</p>
      {existingWorkCount > 0 && (
        <p className="storage-product-note">Buổi này đang có {existingWorkCount} sản phẩm trên LMS.</p>
      )}
      {formError && <div role="alert" className="storage-product-error">{formError}</div>}

      <label className="storage-product-title" htmlFor={`storage-product-title-${studentName}`}>
        Tên sản phẩm trên LMS
        <input
          id={`storage-product-title-${studentName}`}
          className="form-input"
          value={title}
          disabled={saving || locked}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <label className="storage-product-title" htmlFor={`storage-product-comment-${studentName}`}>
        Nhận xét về sản phẩm
        <textarea
          id={`storage-product-comment-${studentName}`}
          className="form-input"
          rows={2}
          value={comment}
          disabled={saving || locked}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>

      {loading ? (
        <p className="storage-product-status"><Loader2 size={14} className="spin-icon" /> Đang tải file...</p>
      ) : error ? (
        <div className="storage-product-error" role="alert">
          {error}
          {onRetry && (
            <button type="button" className="btn btn-xs btn-outline" onClick={onRetry}>Tải lại</button>
          )}
        </div>
      ) : files.length === 0 ? (
        <p className="storage-product-status">Chưa có file nào của học sinh này trên kho sản phẩm.</p>
      ) : (
        <>
          <div className="storage-file-toolbar">
            <label>
              <input
                type="checkbox"
                checked={selectedFiles.length > 0 && selectedFiles.length === Math.min(files.length, MAX_SELECTED_FILES)}
                onChange={toggleAll}
                disabled={saving || locked}
              />
              Chọn tất cả
            </label>
            <span>{selectedFiles.length}/{files.length} file{files.length > MAX_SELECTED_FILES ? ` · tối đa ${MAX_SELECTED_FILES}` : ""}</span>
          </div>
          <div className="storage-file-list" role="list">
            {files.map((file) => {
              const checked = selected.has(file.id);
              const isLink = file.kind === "link";
              const limitReached = !checked && selectedFiles.length >= MAX_SELECTED_FILES;
              return (
                <label key={file.id} className="storage-file-row" role="listitem">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={saving || locked || limitReached || (isLink && !file.linkUrl)}
                    aria-label={file.originalName}
                    onChange={() => toggle(file.id)}
                  />
                  <span className="storage-file-name" title={isLink ? file.linkUrl || file.originalName : file.originalName}>
                    {isLink ? "Link · " : ""}{file.originalName}
                  </span>
                  <span className="storage-file-meta">
                    {isLink ? (file.linkUrl || "Không có link hợp lệ") : `${formatFileSize(file.fileSize)}${formatCreatedAt(file.createdAt) ? ` · ${formatCreatedAt(file.createdAt)}` : ""}`}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}

      <div className="dialog-actions">
        <button type="button" className="btn btn-sm btn-outline" disabled={saving} onClick={onClose}>Đóng</button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={saving || locked || !selectedFiles.length}
          onClick={() => void submit()}
        >
          {saving ? <Loader2 size={14} className="spin-icon" /> : <Check size={14} />}
          {saving ? (existingWorkCount > 0 ? "Đang cập nhật..." : "Đang tải lên LMS...") : existingWorkCount > 0 ? "Cập nhật" : "Nộp lên LMS"}
        </button>
      </div>
    </div>,
    document.body,
  );
}

type DropdownBox = { top: number; left: number; width: number; maxHeight: number };

function placeDropdown(anchor: HTMLElement): DropdownBox {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(420, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < 260 && rect.top > spaceBelow;
  const top = openUp ? 8 : rect.bottom + 6;
  const maxHeight = Math.max(180, openUp ? rect.top - 14 : window.innerHeight - top - 8);
  return { top, left, width, maxHeight };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("vi-VN", { hour12: false });
}
