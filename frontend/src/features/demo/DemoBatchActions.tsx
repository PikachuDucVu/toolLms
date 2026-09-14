import { Send, Shuffle } from "lucide-react";
import { BatchProgressBar } from "../../components/ui/ProgressBar";
import { useDemoStore } from "./demoStore";

export function DemoBatchActions({
  presentCount,
  visibleCount,
  totalCount,
  disabled,
  studentNames,
  onRandom,
  onSubmit,
}: {
  presentCount: number;
  visibleCount: number;
  totalCount: number;
  disabled: boolean;
  studentNames: Record<string, string>;
  onRandom: () => void;
  onSubmit: () => void;
}) {
  const batch = useDemoStore((state) => state.batch);
  const minScore = useDemoStore((state) => state.randomMinScore);
  const maxScore = useDemoStore((state) => state.randomMaxScore);
  const currentName = batch?.currentStudentId ? studentNames[batch.currentStudentId] || batch.currentStudentId : "";

  return (
    <div className="demo-batch-wrapper">
      <div className="demo-class-footer" id="demoActionBar">
        <span className="demo-class-count">
          Hiển thị {visibleCount}/{totalCount} học sinh
        </span>
        <div className="demo-class-footer-actions">
          <div className="demo-random-range" aria-label="Khoảng random điểm">
            <label>
              <span className="sr-only">Random từ điểm</span>
              <input
                type="number"
                min={0}
                max={5}
                step={0.25}
                value={minScore}
                disabled={disabled}
                aria-label="Random từ điểm"
                onChange={(event) => {
                  const next = Number(event.target.value);
                  useDemoStore.getState().setRandomRange(Number.isFinite(next) ? next : 0, maxScore);
                }}
              />
            </label>
            <span className="demo-random-range-gt">&gt;</span>
            <span>điểm</span>
            <span className="demo-random-range-gt">&gt;</span>
            <label>
              <span className="sr-only">Random đến điểm</span>
              <input
                type="number"
                min={0}
                max={5}
                step={0.25}
                value={maxScore}
                disabled={disabled}
                aria-label="Random đến điểm"
                onChange={(event) => {
                  const next = Number(event.target.value);
                  useDemoStore.getState().setRandomRange(minScore, Number.isFinite(next) ? next : 5);
                }}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn btn-outline demo-random-all-btn"
            disabled={disabled || presentCount === 0}
            onClick={onRandom}
          >
            <Shuffle size={16} />
            Random
          </button>
          <button
            type="button"
            className="btn btn-demo"
            id="submitDemoAllBtn"
            disabled={disabled || presentCount === 0}
            onClick={onSubmit}
          >
            <Send size={16} />
            Submit chấm điểm
          </button>
        </div>
      </div>
      {batch && (
        <BatchProgressBar
          className="demo-batch-progress"
          role="status"
          aria-label={batchLabel(batch.phase)}
          phaseLabel={batchLabel(batch.phase)}
          completed={batch.attempted}
          total={batch.total}
          successful={batch.successful}
          failureCount={Object.keys(batch.failures).length}
          currentStudentName={currentName}
          variant="demo"
          failuresNotice={
            Object.keys(batch.failures).length > 0
              ? `${Object.keys(batch.failures).length} học sinh lỗi; quy trình vẫn tiếp tục.`
              : undefined
          }
        />
      )}
    </div>
  );
}

function batchLabel(phase: "previewing" | "submitting" | "reloading") {
  return phase === "previewing"
    ? "Đang lấy điểm Random từ máy chủ"
    : phase === "submitting"
      ? "Đang submit Demo tuần tự"
      : "Đang tải lại dữ liệu lớp";
}
