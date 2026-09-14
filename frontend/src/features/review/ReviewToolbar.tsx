import type { ClassDetail, LearningLevel, Slot } from '@tool-lms/contracts';
import { ChevronDown, Copy, Download, Layers, X } from 'lucide-react';
import { useState } from 'react';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { BatchProgressBar } from '../../components/ui/ProgressBar';
import { useToast } from '../../components/ui/Toast';
import { assessmentDraft, LEARNING_LEVEL_ORDER, levelCatalog } from '../assessments/public/selectors';
import { saveBulkLearningLevel } from '../assessments/public/controller';
import { useAssessmentStore } from '../assessments/public/store';
import { CopyDialog } from '../comments/public/CopyDialog';
import { classZaloText, copyWithFallback, downloadCsv, regularCommentsCsv } from '../comments/public/copyExport';
import { useCommentStore } from '../comments/public/store';
import { ReviewFilters } from './ReviewFilters';
import { ReviewSubmitActions } from './ReviewSubmitActions';
import type { ReviewRow } from './selectors';

export function ReviewToolbar({
  detail,
  slot,
  sessionNumber,
  allRows,
  filteredRows,
  locked,
  onClose,
  onGenerate,
  onSubmit,
}: {
  detail: ClassDetail;
  slot: Slot;
  sessionNumber: number;
  allRows: ReviewRow[];
  filteredRows: ReviewRow[];
  locked: boolean;
  onClose: () => void;
  onGenerate: (ids: string[], filtered: boolean) => void;
  onSubmit: (rows: ReviewRow[], filtered: boolean) => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const drafts = useCommentStore((state) => state.drafts);
  const summary = useCommentStore((state) => state.summaryDraft);
  const batch = useCommentStore((state) => state.batch);
  const [copyText, setCopyText] = useState('');
  const warningCount = allRows.filter((row) => row.hasWarning).length;
  const draftCount = allRows.filter((row) => row.isPresent && row.isDraft).length;
  const presentIds = allRows.filter((row) => row.isPresent).map((row) => row.studentId);
  const studentNames = Object.fromEntries(slot.studentAttendance.map((s) => [s.studentId, s.displayName]));
  const currentStudentName = batch?.currentStudentId ? studentNames[batch.currentStudentId] || batch.currentStudentId : null;

  const setBulkLevel = async (value: string) => {
    if (!value) return;
    const level = value as LearningLevel;
    const targets = presentIds.filter((studentId) => assessmentDraft(useAssessmentStore.getState(), studentId).learningLevel !== level);
    if (!targets.length) return toast.show(`Tất cả học sinh có mặt đã ở ${levelCatalog(sessionNumber)[level].code}`, 'info');
    const accepted = await confirm({
      title: `Đặt ${levelCatalog(sessionNumber)[level].code} cho cả lớp?`,
      description: `Áp dụng cho đúng ${targets.length} học sinh có mặt. Ghi chú và bản nháp nhận xét được giữ nguyên.`,
      confirmLabel: `Đặt ${levelCatalog(sessionNumber)[level].code}`,
    });
    if (!accepted) return;
    try {
      const result = await saveBulkLearningLevel(targets, level, 3);
      toast.show(
        result.failures.length
          ? `Đã đặt level cho ${result.successfulIds.length}/${targets.length} học sinh.`
          : `Đã đặt ${levelCatalog(sessionNumber)[level].code} cho ${targets.length} học sinh.`,
        result.failures.length ? 'info' : 'success'
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.show(`Lỗi đổi level cả lớp: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    }
  };

  const copyAll = async () => {
    const value = classZaloText({ slot, sessionNumber, summary, drafts });
    if (!value.count) return toast.show('Chưa có nhận xét nào', 'error');
    const mobile = window.innerWidth <= 768 || 'ontouchstart' in window;
    if (!mobile && (await copyWithFallback(value.text))) {
      toast.show(`Đã copy ${value.count} nhận xét Zalo!`, 'success');
    } else {
      setCopyText(value.text);
    }
  };

  const exportAll = () => {
    downloadCsv(detail, slot, regularCommentsCsv(slot.studentAttendance, drafts, useAssessmentStore.getState(), sessionNumber), sessionNumber);
    toast.show('Đã export CSV!', 'success');
  };

  return (
    <>
      <header className="regular-review-header">
        <div className="regular-review-title-block">
          <button
            type="button"
            className="btn btn-sm btn-outline regular-review-close-btn"
            aria-label="Đóng modal review"
            onClick={onClose}
          >
            <X size={15} />
            <span>Đóng</span>
          </button>
          <div>
            <h2 id="regularReviewTitle">Review cả lớp</h2>
            <p>
              {draftCount} bản nháp · {warningCount} cần chú ý · {filteredRows.length}/{allRows.length} đang hiển thị
            </p>
          </div>
        </div>
        <div className="regular-review-primary-actions">
          <label className="regular-review-bulk-level">
            <span className="sr-only">Mức cả lớp</span>
            <div className="regular-review-bulk-level-btn">
              <Layers size={15} className="text-slate-600" />
              <span>Mức cả lớp ({presentIds.length})</span>
              <ChevronDown size={14} className="text-slate-400" />
            </div>
            <select
              className="regular-review-bulk-level-select"
              aria-label="Mức cả lớp trong review"
              defaultValue=""
              disabled={locked || !presentIds.length}
              onChange={(event) => {
                void setBulkLevel(event.target.value);
                event.currentTarget.value = '';
              }}
            >
              <option value="">Mức cả lớp ({presentIds.length})</option>
              {LEARNING_LEVEL_ORDER.map((level) => (
                <option key={level} value={level}>
                  {levelCatalog(sessionNumber)[level].code} · {levelCatalog(sessionNumber)[level].shortLabel}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-sm btn-outline regular-review-header-action"
            disabled={!draftCount}
            onClick={() => void copyAll()}
          >
            <Copy size={15} className="text-blue-600" />
            <span>Sao chép Zalo</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline regular-review-header-action"
            disabled={!allRows.length}
            onClick={exportAll}
          >
            <Download size={15} className="text-blue-600" />
            <span>Xuất CSV</span>
          </button>
        </div>
      </header>
      {batch && (
        <div className="regular-review-progress-banner show" role="status" aria-live="polite">
          <BatchProgressBar
            phaseLabel={
              batch.phase === 'persisting'
                ? 'Đang lưu đánh giá'
                : batch.phase === 'generating'
                  ? 'Đang tạo nhận xét AI'
                  : 'Đang gửi LMS'
            }
            completed={batch.completed}
            total={batch.total}
            successful={batch.successful}
            failureCount={Object.keys(batch.failures).length}
            currentStudentName={currentStudentName}
            variant="primary"
            compact
            failuresNotice={
              Object.keys(batch.failures).length > 0
                ? `${Object.keys(batch.failures).length} học sinh lỗi; bản nháp liên quan được giữ lại.`
                : undefined
            }
            extraMeta={
              batch.safeTemplateCount > 0 ? (
                <div className="progress-notice progress-notice-warning">
                  <small>{batch.safeTemplateCount} nhận xét dùng mẫu an toàn.</small>
                </div>
              ) : undefined
            }
          />
        </div>
      )}
      <div className="regular-review-toolbar" aria-label="Bộ lọc review nhận xét">
        <ReviewFilters sessionNumber={sessionNumber} />
        <div className="regular-review-filter-actions">
          <ReviewSubmitActions
            allRows={allRows}
            filteredRows={filteredRows}
            locked={locked}
            onGenerate={onGenerate}
            onSubmit={onSubmit}
          />
        </div>
      </div>
      <CopyDialog
        open={Boolean(copyText)}
        title="Copy nhận xét cả lớp"
        text={copyText}
        onClose={() => setCopyText('')}
        onCopied={() => toast.show('Đã copy nhận xét Zalo!', 'success')}
      />
    </>
  );
}
