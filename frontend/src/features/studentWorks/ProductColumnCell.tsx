import type { StorageProductFile, StudentWork } from "@tool-lms/contracts";
import { ChevronDown, FolderGit2 } from "lucide-react";
import { useRef } from "react";
import { filesForStudent } from "@tool-lms/contracts";
import { StorageProductDialog } from "./StorageProductDialog";
import { latestStudentWork, submittedProductItems } from "./storageSubmission";

export function ProductColumnCell({
  studentId,
  studentName,
  files,
  works,
  loading = false,
  error = null,
  locked = false,
  menuOpen = false,
  onToggle,
  onClose,
  onRetry,
  onSubmit,
}: {
  studentId: string;
  studentName: string;
  files: StorageProductFile[];
  works: StudentWork[];
  loading?: boolean;
  error?: string | null;
  locked?: boolean;
  menuOpen?: boolean;
  onToggle?: (studentId: string) => void;
  onClose?: () => void;
  onRetry?: () => void;
  onSubmit?: (studentId: string, files: StorageProductFile[], title: string, comment: string, workId?: string) => Promise<void>;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const studentFiles = filesForStudent(files, studentId, studentName);
  const submitted = submittedProductItems(works);
  const current = latestStudentWork(works);
  const fileCountLabel = loading ? "Đang tải" : error ? "Lỗi file" : studentFiles.length ? `${studentFiles.length} file` : "Chưa có";

  return (
    <div className="product-column-stack">
      <span className={`product-column-status${submitted.length ? " is-submitted" : ""}`}>
        {submitted.length ? `Đã nộp ${submitted.length}` : "Chưa nộp"}
      </span>
      {submitted.length > 0 && (
        <ul className="product-column-files">
          {submitted.slice(0, 3).map((item, index) => (
            <li key={`${item.kind}-${item.name}-${index}`} title={item.name}>
              {item.kind === "link" ? "Link" : "File"} · {item.name}
            </li>
          ))}
          {submitted.length > 3 && <li>+{submitted.length - 3}</li>}
        </ul>
      )}
      <button
        ref={buttonRef}
        type="button"
        className={`btn-view-comment btn-product-column${menuOpen ? " is-open" : ""}`}
        aria-label={`Sản phẩm của ${studentName}`}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        title={error || (submitted.length ? `Cập nhật sản phẩm của ${studentName}` : `Chọn file sản phẩm của ${studentName}`)}
        onClick={() => onToggle?.(studentId)}
      >
        <FolderGit2 size={13} />
        {submitted.length ? "Cập nhật" : fileCountLabel}
        <ChevronDown size={13} />
      </button>
      <StorageProductDialog
        open={menuOpen}
        anchor={buttonRef.current}
        studentName={studentName}
        files={studentFiles}
        loading={loading}
        error={error}
        existingWorkCount={works.length}
        locked={locked}
        onClose={() => onClose?.()}
        onRetry={onRetry}
        onSubmit={(selected, title, comment) => onSubmit?.(studentId, selected, title, comment, current?.id) ?? Promise.resolve()}
      />
    </div>
  );
}
