import type { SaveStudentWorkInput, StudentWork } from "@tool-lms/contracts";
import { QueryClient, QueryClientContext, useMutation, useQuery } from "@tanstack/react-query";
import { Edit2, ExternalLink, FolderGit2, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { useContext, useState } from "react";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { deleteStudentWork, saveStudentWork } from "./api";
import { studentWorksQuery } from "./queries";
import { StudentWorkDialog } from "./StudentWorkDialog";
import { canShowThumbnail } from "./thumbnailSrc";

const fallbackQueryClient = new QueryClient({ defaultOptions: { queries: { enabled: false } } });

export function StudentWorkSection({
  classId,
  slotId,
  studentId,
  studentName,
  sessionNumber,
  locked = false,
}: {
  classId: string;
  slotId: string;
  studentId: string;
  studentName: string;
  sessionNumber?: number;
  locked?: boolean;
}) {
  const contextClient = useContext(QueryClientContext);
  const queryClient = contextClient || fallbackQueryClient;
  const toast = useToast();
  const confirm = useConfirm();

  const [dialogWork, setDialogWork] = useState<StudentWork | null | undefined>(undefined);

  const { data, isLoading, error } = useQuery(
    {
      ...studentWorksQuery(classId, slotId),
      enabled: Boolean(contextClient && classId && slotId),
    },
    queryClient,
  );
  const studentWorks = (data?.data.studentWorks || []).filter((w) => w.studentId === studentId);

  const saveMutation = useMutation(
    {
      mutationFn: (payload: SaveStudentWorkInput) => saveStudentWork(slotId, payload),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["studentWorks", classId, slotId] });
      },
    },
    queryClient,
  );

  const deleteMutation = useMutation(
    {
      mutationFn: (workId: string) => deleteStudentWork(slotId, workId),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["studentWorks", classId, slotId] });
      },
    },
    queryClient,
  );

  const handleSave = async (payload: SaveStudentWorkInput) => {
    await saveMutation.mutateAsync(payload);
  };

  const handleDelete = async (workId: string) => {
    await deleteMutation.mutateAsync(workId);
  };

  const confirmDelete = async (work: StudentWork) => {
    const ok = await confirm({
      title: "Xóa sản phẩm?",
      description: `Bạn có chắc chắn muốn xóa sản phẩm "${work.latestData.title}" của ${studentName}?`,
      confirmLabel: "Xóa sản phẩm",
    });
    if (!ok) return;

    try {
      await handleDelete(work.id);
      toast.show("Đã xóa sản phẩm!", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Xóa sản phẩm thất bại";
      toast.show(msg, "error");
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <span className="badge badge-success">Đã duyệt</span>;
      case "rejected":
        return <span className="badge badge-danger">Từ chối</span>;
      default:
        return <span className="badge badge-warning">Chờ duyệt</span>;
    }
  };

  return (
    <section className="student-detail-section student-work-section" aria-label="Sản phẩm của học sinh">
      <div className="student-detail-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
          <FolderGit2 size={16} style={{ color: "var(--primary)" }} />
          Sản phẩm học viên
          {studentWorks.length > 0 && (
            <span className="badge badge-neutral" style={{ fontSize: 11, marginLeft: 4 }}>
              {studentWorks.length}
            </span>
          )}
        </span>
        <button
          type="button"
          className="btn btn-xs btn-outline"
          disabled={locked}
          onClick={() => setDialogWork(null)}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <Plus size={13} /> Thêm sản phẩm
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: "12px 0" }}>
          <span className="skeleton" style={{ height: 50, display: "block", marginBottom: 8 }} />
        </div>
      ) : error ? (
        <div style={{ fontSize: 13, color: "#dc2626", padding: "8px 0" }}>
          Không thể tải dữ liệu sản phẩm học viên.
        </div>
      ) : studentWorks.length === 0 ? (
        <div
          style={{
            padding: "16px",
            textAlign: "center",
            background: "var(--surface-subtle)",
            border: "1px dashed var(--border-color)",
            borderRadius: "var(--radius-xs)",
            margin: "8px 0",
          }}
        >
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
            Chưa có sản phẩm nào của học sinh trong buổi học này.
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={locked}
            onClick={() => setDialogWork(null)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Plus size={14} /> Thêm sản phẩm
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {studentWorks.map((work) => (
            <div
              key={work.id}
              style={{
                display: "flex",
                gap: 12,
                padding: "12px",
                background: "var(--surface-subtle)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-xs)",
                alignItems: "flex-start",
              }}
            >
              {/* Thumbnail */}
              {canShowThumbnail(work.latestData.thumbnail) ? (
                <div
                  style={{
                    width: 72,
                    height: 48,
                    borderRadius: "var(--radius-xs)",
                    overflow: "hidden",
                    border: "1px solid var(--border-color)",
                    flexShrink: 0,
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  <img
                    src={work.latestData.thumbnail}
                    alt={work.latestData.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: 72,
                    height: 48,
                    borderRadius: "var(--radius-xs)",
                    border: "1px dashed var(--border-color)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    backgroundColor: "var(--surface-card)",
                    color: "var(--text-muted)",
                  }}
                >
                  <ImageIcon size={20} style={{ opacity: 0.5 }} />
                </div>
              )}

              {/* Main info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <strong style={{ fontSize: 14, color: "var(--text-heading)" }}>
                    {work.latestData.title}
                  </strong>
                  {statusBadge(work.status)}
                </div>

                {work.latestData.comment && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-primary)",
                      background: "var(--surface-card)",
                      padding: "6px 10px",
                      borderRadius: "var(--radius-xs)",
                      border: "1px solid var(--border-color)",
                      marginBottom: 6,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {work.latestData.comment}
                  </div>
                )}

                {work.latestData.relatedUrls && work.latestData.relatedUrls.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {work.latestData.relatedUrls.map((link, idx) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="badge badge-info"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}
                        title={link.url}
                      >
                        <ExternalLink size={11} />
                        {link.name || "Link liên kết"}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-xs btn-outline"
                  disabled={locked}
                  onClick={() => setDialogWork(work)}
                  aria-label="Sửa sản phẩm"
                  title="Sửa sản phẩm"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-outline"
                  disabled={locked}
                  onClick={() => void confirmDelete(work)}
                  aria-label="Xóa sản phẩm"
                  title="Xóa sản phẩm"
                  style={{ color: "#dc2626" }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialogWork !== undefined && (
        <StudentWorkDialog
          open={true}
          studentName={studentName}
          classId={classId}
          classSessionId={slotId}
          studentId={studentId}
          sessionNumber={sessionNumber}
          work={dialogWork}
          onClose={() => setDialogWork(undefined)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </section>
  );
}
