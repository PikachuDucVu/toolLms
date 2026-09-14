import type { RelatedUrl, SaveStudentWorkInput, StudentWork } from "@tool-lms/contracts";
import { Check, Image, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { uploadThumbnail } from "./api";

export function StudentWorkDialog({
  open,
  studentName,
  classId,
  classSessionId,
  studentId,
  sessionNumber,
  work,
  loading = false,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  studentName: string;
  classId: string;
  classSessionId: string;
  studentId: string;
  sessionNumber?: number;
  work?: StudentWork | null;
  loading?: boolean;
  onClose: () => void;
  onSave: (payload: SaveStudentWorkInput) => Promise<void>;
  onDelete?: (workId: string) => Promise<void>;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [comment, setComment] = useState("");
  const [relatedUrls, setRelatedUrls] = useState<RelatedUrl[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (work) {
        setTitle(work.latestData.title || "");
        setThumbnail(work.latestData.thumbnail || "");
        setComment(work.latestData.comment || "");
        setRelatedUrls(
          work.latestData.relatedUrls?.map((u) => ({ name: u.name || "", url: u.url || "" })) || []
        );
      } else {
        setTitle("");
        setThumbnail("");
        setComment("");
        setRelatedUrls([]);
      }
      setFormError(null);
    }
  }, [open, work]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setFormError(null);
    try {
      const res = await uploadThumbnail(file);
      setThumbnail(res.data.url);
      toast.show("Tải ảnh đại diện thành công!", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tải ảnh thất bại";
      setFormError(msg);
      toast.show(msg, "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddLink = () => {
    setRelatedUrls((prev) => [...prev, { name: "", url: "" }]);
  };

  const handleLinkChange = (index: number, field: "name" | "url", value: string) => {
    setRelatedUrls((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveLink = (index: number) => {
    setRelatedUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError("Vui lòng nhập tên sản phẩm.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const validLinks = relatedUrls.filter((l) => l.name.trim() || l.url.trim());
      await onSave({
        id: work?.id,
        classId,
        classSessionId,
        studentId,
        displayOrder: work?.displayOrder ?? 0,
        classSessionNumber: sessionNumber,
        title: cleanTitle,
        thumbnail: thumbnail.trim(),
        videoUrls: work?.latestData?.videoUrls || [],
        imageUrl: work?.latestData?.imageUrl || [],
        attachmentUrls: work?.latestData?.attachmentUrls || [],
        comment: comment.trim(),
        rejectReason: work?.latestData?.rejectReason || "",
        relatedUrls: validLinks,
      });
      toast.show(work ? "Đã cập nhật sản phẩm!" : "Đã tạo mới sản phẩm!", "success");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lưu sản phẩm thất bại";
      setFormError(msg);
      toast.show(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!work?.id || !onDelete) return;
    const ok = await confirm({
      title: "Xóa sản phẩm?",
      description: `Bạn có chắc chắn muốn xóa sản phẩm "${work.latestData.title}" của ${studentName}?`,
      confirmLabel: "Xóa sản phẩm",
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await onDelete(work.id);
      toast.show("Đã xóa sản phẩm!", "success");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Xóa sản phẩm thất bại";
      toast.show(msg, "error");
    } finally {
      setDeleting(false);
    }
  };

  const isBusy = loading || uploading || saving || deleting;

  return (
    <Dialog
      open={open}
      title={work ? "Cập nhật sản phẩm học viên" : "Thêm sản phẩm cho học viên"}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isBusy) onClose();
      }}
    >
      <div style={{ marginBottom: 14, fontSize: 13, color: "var(--text-muted)" }}>
        Học sinh: <strong style={{ color: "var(--text-heading)" }}>{studentName}</strong>
      </div>

      {formError && (
        <div
          role="alert"
          style={{
            padding: "8px 12px",
            marginBottom: 14,
            background: "rgba(220, 38, 38, 0.1)",
            border: "1px solid rgba(220, 38, 38, 0.3)",
            borderRadius: "var(--radius-xs)",
            color: "#dc2626",
            fontSize: 13,
          }}
        >
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Tên sản phẩm */}
        <div>
          <label
            htmlFor="student-work-title"
            style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}
          >
            Tên sản phẩm <span style={{ color: "red" }}>*</span>
          </label>
          <input
            id="student-work-title"
            className="form-input"
            type="text"
            required
            placeholder="Ví dụ: Game Bắn Ruồi, Website Bán Hàng..."
            value={title}
            disabled={isBusy}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        {/* Thumbnail / Ảnh đại diện */}
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Ảnh đại diện (Thumbnail)
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            {thumbnail ? (
              <div
                style={{
                  position: "relative",
                  width: 96,
                  height: 64,
                  borderRadius: "var(--radius-xs)",
                  overflow: "hidden",
                  border: "1px solid var(--border-color)",
                  flexShrink: 0,
                  backgroundColor: "#f3f4f6",
                }}
              >
                <img
                  src={thumbnail}
                  alt="Thumbnail"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <button
                  type="button"
                  onClick={() => setThumbnail("")}
                  disabled={isBusy}
                  aria-label="Xóa ảnh đại diện"
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    background: "rgba(0,0,0,0.6)",
                    color: "white",
                    border: "none",
                    borderRadius: "50%",
                    width: 20,
                    height: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div
                style={{
                  width: 96,
                  height: 64,
                  borderRadius: "var(--radius-xs)",
                  border: "1px dashed var(--border-color)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  backgroundColor: "var(--surface-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                <Image size={24} style={{ opacity: 0.5 }} />
              </div>
            )}

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                  id="student-work-thumbnail-file"
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  {uploading ? <Loader2 size={14} className="spin-icon" /> : <Upload size={14} />}
                  {uploading ? "Đang tải lên..." : "Tải ảnh từ máy"}
                </button>
              </div>
              <input
                className="form-input"
                type="text"
                placeholder="Hoặc dán URL ảnh đại diện"
                value={thumbnail}
                disabled={isBusy}
                onChange={(e) => setThumbnail(e.target.value)}
                style={{ width: "100%", fontSize: 12 }}
              />
            </div>
          </div>
        </div>

        {/* Liên kết liên quan (Related URLs) */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <label style={{ fontSize: 13, fontWeight: 600 }}>Liên kết sản phẩm</label>
            <button
              type="button"
              className="btn btn-xs btn-outline"
              disabled={isBusy}
              onClick={handleAddLink}
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <Plus size={12} /> Thêm link
            </button>
          </div>

          {relatedUrls.length === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                fontStyle: "italic",
                padding: "6px 0",
              }}
            >
              Chưa có link nào (Link Scratch, Github, Website, Slide...)
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {relatedUrls.map((item, index) => (
                <div key={index} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Tên link (VD: Link Scratch)"
                    value={item.name}
                    disabled={isBusy}
                    onChange={(e) => handleLinkChange(index, "name", e.target.value)}
                    style={{ flex: "0 0 40%", fontSize: 12 }}
                  />
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Đường dẫn URL"
                    value={item.url}
                    disabled={isBusy}
                    onChange={(e) => handleLinkChange(index, "url", e.target.value)}
                    style={{ flex: 1, fontSize: 12 }}
                  />
                  <button
                    type="button"
                    className="btn btn-xs btn-outline"
                    disabled={isBusy}
                    onClick={() => handleRemoveLink(index)}
                    aria-label="Xóa liên kết"
                    style={{ color: "#dc2626" }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Nhận xét sản phẩm */}
        <div>
          <label
            htmlFor="student-work-comment"
            style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}
          >
            Nhận xét về sản phẩm
          </label>
          <textarea
            id="student-work-comment"
            className="form-input"
            rows={3}
            placeholder="Nhận xét ưu điểm, điểm sáng tạo hoặc cần cải thiện của sản phẩm..."
            value={comment}
            disabled={isBusy}
            onChange={(e) => setComment(e.target.value)}
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>

        {/* Dialog Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: work ? "space-between" : "flex-end",
            alignItems: "center",
            marginTop: 10,
            paddingTop: 12,
            borderTop: "1px solid var(--border-color)",
          }}
        >
          {work && onDelete && (
            <button
              type="button"
              className="btn btn-outline"
              disabled={isBusy}
              onClick={() => void handleDelete()}
              style={{ color: "#dc2626", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {deleting ? <Loader2 size={14} className="spin-icon" /> : <Trash2 size={14} />}
              {deleting ? "Đang xóa..." : "Xóa sản phẩm"}
            </button>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-outline" disabled={isBusy} onClick={onClose}>
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isBusy}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {saving ? <Loader2 size={14} className="spin-icon" /> : <Check size={14} />}
              {saving ? "Đang lưu..." : work ? "Cập nhật" : "Lưu sản phẩm"}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
