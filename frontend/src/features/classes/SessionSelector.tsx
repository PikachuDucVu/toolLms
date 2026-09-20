import type { ClassDetail, Slot } from "@tool-lms/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, ChevronLeft, ChevronRight, FileText, Pencil, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../components/ui/Toast";
import { useCheckpointStore } from "../checkpoint/public/store";
import { useCommentStore } from "../comments/public/store";
import { useDemoStore } from "../demo/public/store";
import { saveSlotSummary } from "./api";
import { classDetailQuery } from "./queries";
import { getSlotDisplayNumber, hasLegacyComment, sessionMode, stripHtml } from "./selectors";

export function getSlotStatus(slot: Slot | undefined, slotIdx: number) {
  if (!slot) return { state: "empty", color: "gray", label: "Chưa có dữ liệu" };
  const attendance = slot.studentAttendance || [];
  const present = attendance.filter((att) => att.status === "ATTENDED" || att.status === "LATE_ARRIVED");
  const hasSummary = Boolean(stripHtml(slot.summary).trim());
  const isPastOrToday = slot.date ? new Date(slot.date) <= new Date() : false;

  if (!attendance.length && !isPastOrToday) {
    return { state: "future", color: "gray", label: "Chưa diễn ra" };
  }

  const completed = present.filter((att) =>
    hasLegacyComment(att) ||
    (att.commentByAreas &&
      att.commentByAreas.some(
        (a) =>
          (a.type === "CONTENT" && Boolean(stripHtml(a.content || "").trim())) ||
          a.type === "CHECKPOINT" ||
          a.type === "DEMO",
      )),
  ).length;
  const missing = Math.max(present.length - completed, 0);

  if (present.length > 0 && missing > 0) {
    return {
      state: "pending_comment",
      color: "red",
      label: `Chưa nhận xét (${missing}/${present.length} học sinh)`,
    };
  }

  if (!hasSummary) {
    return {
      state: "missing_summary",
      color: "yellow",
      label: "Chưa điền thông tin buổi học",
    };
  }

  return {
    state: "completed",
    color: "green",
    label: "Đã hoàn thành",
  };
}

export function SessionSelector({
  detail,
  value,
  disabled,
  refreshing,
  onChange,
  onRefresh,
}: {
  detail?: ClassDetail;
  value: string;
  disabled: boolean;
  refreshing: boolean;
  onChange: (value: string) => void;
  onRefresh: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const commentSummaryDraft = useCommentStore((state) => state.summaryDraft);
  const demoSummaryDraft = useDemoStore((state) => state.summaryDraft);
  const checkpointSummaryDraft = useCheckpointStore((state) => state.summaryDraft);
  const [showSummaryEdit, setShowSummaryEdit] = useState(false);
  const [optimisticSummary, setOptimisticSummary] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);
  const [carouselOffset, setCarouselOffset] = useState(0);

  const slots = detail?.slots || [];
  const totalSlots = slots.length;
  const windowSize = 5;
  const maxOffset = Math.max(0, totalSlots - windowSize);
  const currentSlotIdx = value !== "" ? Number(value) : -1;
  const currentSlot = currentSlotIdx >= 0 && currentSlotIdx < slots.length ? slots[currentSlotIdx] : undefined;

  const mode = useMemo(() => sessionMode(currentSlot || null, value), [currentSlot, value]);

  const activeDraft = useMemo(() => {
    if (mode === "demo") return demoSummaryDraft;
    if (mode === "checkpoint") return checkpointSummaryDraft;
    return commentSummaryDraft;
  }, [mode, demoSummaryDraft, checkpointSummaryDraft, commentSummaryDraft]);

  const slotCleanSummary = useMemo(() => (
    currentSlot?.summary ? stripHtml(currentSlot.summary).trim() : ""
  ), [currentSlot?.summary]);
  const effectiveSlotSummary = slotCleanSummary || optimisticSummary;

  const cleanSummary = activeDraft.trim() || effectiveSlotSummary;
  const isEmptySelectedTopic = Boolean(currentSlot) && !effectiveSlotSummary;
  const summaryEditorOpen = showSummaryEdit || isEmptySelectedTopic;

  useEffect(() => {
    if (currentSlotIdx >= 0 && totalSlots > 0) {
      setCarouselOffset(Math.max(0, Math.min(currentSlotIdx - 2, maxOffset)));
    }
  }, [currentSlotIdx, totalSlots, maxOffset]);

  useEffect(() => {
    setShowSummaryEdit(false);
    setOptimisticSummary("");
  }, [currentSlotIdx]);

  const visibleSlots = useMemo(() => {
    const start = Math.max(0, Math.min(carouselOffset, maxOffset));
    return slots.slice(start, start + windowSize).map((slot, i) => ({
      slot,
      idx: start + i,
    }));
  }, [carouselOffset, maxOffset, slots, windowSize]);

  const scrollCarousel = (direction: number) => {
    setCarouselOffset((prev) => Math.max(0, Math.min(prev + direction * 2, maxOffset)));
  };

  const handleToggleEdit = () => {
    if (!showSummaryEdit) {
      if (!activeDraft.trim() && effectiveSlotSummary) {
        useCommentStore.getState().setSummaryDraft(effectiveSlotSummary);
        useDemoStore.getState().setSummaryDraft(effectiveSlotSummary);
        useCheckpointStore.getState().setSummaryDraft(effectiveSlotSummary);
      }
    }
    setShowSummaryEdit((prev) => !prev);
  };

  const handleSaveSummary = async () => {
    if (!detail || !currentSlot) return;
    const textToSave = activeDraft.trim() || effectiveSlotSummary;
    if (!textToSave) {
      toast.show("Vui lòng nhập chủ đề buổi học", "error");
      return;
    }
    setSavingSummary(true);
    try {
      await saveSlotSummary(currentSlot.id, {
        classId: detail.id,
        summary: textToSave,
      });

      queryClient.setQueryData(classDetailQuery(detail.id).queryKey, (old: unknown) => {
        const oldEnvelope = old as { success?: boolean; data?: { class?: ClassDetail } } | undefined;
        if (!oldEnvelope?.data?.class?.slots) return old;
        const classData = oldEnvelope.data.class;
        return {
          ...oldEnvelope,
          data: {
            ...oldEnvelope.data,
            class: {
              ...classData,
              slots: classData.slots.map((s) =>
                s.id === currentSlot.id ? { ...s, summary: `<p>${textToSave}</p>` } : s,
              ),
            },
          },
        };
      });

      useCommentStore.getState().setSummaryDraft(textToSave);
      useCommentStore.getState().markSummarySynced(textToSave);
      useDemoStore.getState().setSummaryDraft(textToSave);
      useDemoStore.setState({ summarySynced: textToSave });
      useCheckpointStore.getState().setSummaryDraft(textToSave);
      useCheckpointStore.setState({ summarySynced: textToSave });

      toast.show("Đã lưu chủ đề buổi học!", "success");
      setOptimisticSummary(textToSave);
      setShowSummaryEdit(false);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        toast.show(`Lỗi lưu chủ đề: ${cause instanceof Error ? cause.message : String(cause)}`, "error");
      }
    } finally {
      setSavingSummary(false);
    }
  };

  return (
    <div className="card session-context-card">
      <h2 className="sr-only">Chọn buổi học</h2>

      <div className="session-context-bar">
        {/* Left: Class Meta & Carousel */}
        <div className="session-bar-left">
          <div className="slot-class-meta" id="slotClassMeta">
            <div className="slot-class-info">
              <strong id="slotClassTitle" title={detail?.name || "Chưa chọn lớp"}>
                {detail?.name || "Chưa chọn lớp"}
              </strong>
              <span id="slotCourseName" title={detail?.course?.name || "Chọn lớp học từ danh sách"}>
                {detail?.course?.name || "Chọn lớp học từ danh sách"}
              </span>
            </div>
            <div className="slot-total-count" id="slotTotalCount">
              Tổng: {totalSlots} buổi
            </div>
          </div>

          <div className="slot-carousel-container">
            <button
              type="button"
              className="slot-nav-btn prev"
              id="slotPrevBtn"
              onClick={() => scrollCarousel(-1)}
              disabled={disabled || !detail || carouselOffset <= 0}
              aria-label="Buổi trước"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="slot-carousel-track" id="slotCarouselTrack" role="tablist" aria-label="Danh sách buổi học">
              {visibleSlots.map(({ slot, idx }) => {
                const isSelected = idx === currentSlotIdx;
                const status = getSlotStatus(slot, idx);
                const slotNum = getSlotDisplayNumber(slot, idx);
                const dateObj = slot.date ? new Date(slot.date) : null;
                const dateShort = dateObj
                  ? `${String(dateObj.getDate()).padStart(2, "0")}/${String(dateObj.getMonth() + 1).padStart(2, "0")}`
                  : "--/--";

                return (
                  <button
                    type="button"
                    key={slot.id || idx}
                    className={`slot-card-btn ${isSelected ? "active" : ""} status-${status.color}`}
                    data-slot-idx={idx}
                    onClick={() => onChange(String(idx))}
                    disabled={disabled}
                    aria-selected={isSelected}
                    title={`Buổi ${slotNum} (${dateShort}): ${status.label}`}
                  >
                    <span className={`slot-status-dot ${status.color}`} aria-hidden="true" />
                    <span className="slot-title">Buổi {slotNum}</span>
                    <span className="slot-date">{dateShort}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="slot-nav-btn next"
              id="slotNextBtn"
              onClick={() => scrollCarousel(1)}
              disabled={disabled || !detail || carouselOffset >= maxOffset}
              aria-label="Buổi kế tiếp"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Right: Topic Pill + Legend + Refresh */}
        <div className="session-bar-right">
          <div
            className="slot-topic-card"
            id="slotTopicCard"
            onClick={!summaryEditorOpen && currentSlot ? handleToggleEdit : undefined}
            title={cleanSummary || "Chưa có chủ đề buổi học"}
          >
            <div className="slot-topic-content">
              <FileText className="topic-icon" size={15} />
              <span className="topic-label">Chủ đề:</span>
              <span className="topic-text" id="slotTopicDisplay">
                {cleanSummary || (summaryEditorOpen ? "" : "Chưa có chủ đề buổi học")}
              </span>
            </div>
            {!isEmptySelectedTopic && (
              <button
                type="button"
                className="topic-edit-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleEdit();
                }}
                disabled={disabled || !currentSlot}
                aria-label="Chỉnh sửa chủ đề"
                title="Chỉnh sửa chủ đề"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>

          <div className="slot-status-legend" aria-label="Chú thích màu buổi học">
            <span className="slot-legend-item">
              <span className="slot-status-dot green" aria-hidden="true" />
              Đã xong
            </span>
            <span className="slot-legend-item">
              <span className="slot-status-dot yellow" aria-hidden="true" />
              Chưa điền thông tin
            </span>
            <span className="slot-legend-item">
              <span className="slot-status-dot red" aria-hidden="true" />
              Chưa nhận xét
            </span>
          </div>

          {onRefresh && (
            <button
              type="button"
              className="btn btn-sm btn-outline btn-icon session-refresh-btn"
              disabled={disabled || !detail || refreshing}
              onClick={onRefresh}
              aria-label="Refresh dữ liệu lớp"
              title="Refresh dữ liệu lớp"
            >
              <RefreshCw size={14} className={refreshing ? "spin-icon" : ""} />
              <span className="sr-only">Refresh dữ liệu lớp</span>
            </button>
          )}
        </div>
      </div>

      {/* Accessible select element for programmatic compatibility and tests */}
      <label htmlFor="comments-slot" className="sr-only">
        Buổi học
      </label>
      <select
        id="comments-slot"
        className="sr-only"
        value={value}
        disabled={disabled || !detail}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">-- Chọn buổi --</option>
        {slots.map((slot, index) => (
          <option key={slot.id || index} value={index}>
            Buổi {getSlotDisplayNumber(slot, index)} -{" "}
            {slot.date ? new Date(slot.date).toLocaleDateString("vi-VN") : "Chưa có ngày"}
          </option>
        ))}
      </select>

      {/* Expandable summary edit panel */}
      {summaryEditorOpen && (
        <div className="summary-edit-panel" id="summaryEditPanel">
          <textarea
            className="form-input"
            id="sessionSummary"
            placeholder="Nhập chủ đề hoặc tổng kết buổi học..."
            rows={2}
            value={activeDraft}
            onChange={(e) => {
              const val = e.target.value;
              useCommentStore.getState().setSummaryDraft(val);
              useDemoStore.getState().setSummaryDraft(val);
              useCheckpointStore.getState().setSummaryDraft(val);
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                if (!savingSummary && activeDraft.trim()) {
                  void handleSaveSummary();
                }
              }
            }}
            autoFocus
          />
          <div className="summary-edit-footer">
            <span className="summary-hint">Mẹo: Nhấn Ctrl + Enter để lưu nhanh</span>
            <div className="summary-actions">
              {!isEmptySelectedTopic && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => setShowSummaryEdit(false)}
                >
                  Hủy
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => void handleSaveSummary()}
                disabled={savingSummary || !activeDraft.trim()}
              >
                {savingSummary ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
