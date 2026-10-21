import { CheckCheck, Sparkles, Zap } from 'lucide-react';
import { useHomeworkStore } from './store';

export function BatchActions({ disabled, pendingCount, jobActive, onMarkSelected, onMarkAll, onAiSelected, onAiAll }: {
  disabled: boolean;
  pendingCount: number;
  jobActive: boolean;
  onMarkSelected: () => void;
  onMarkAll: () => void;
  onAiSelected: () => void;
  onAiAll: () => void;
}) {
  const selectedCount = useHomeworkStore((state) => state.selectedIds.size);
  const batchScore = useHomeworkStore((state) => state.batchScore);
  const setBatchScore = useHomeworkStore((state) => state.setBatchScore);
  return <div className="batch-actions">
    <div className="batch-actions-info">
      <strong>Thao tác hàng loạt</strong>
      <span>{selectedCount ? `Đã chọn ${selectedCount} bài` : `${pendingCount} bài chờ chấm`}</span>
    </div>
    <div className="batch-actions-group" role="group" aria-label="Chấm tay">
      <label className="batch-score-field"><span>Điểm</span><input aria-label="Điểm chấm hàng loạt" type="number" className="score-input" min="0" max="100" value={batchScore} disabled={disabled} onChange={(event) => setBatchScore(event.target.value)} /></label>
      <button type="button" className="btn btn-success btn-sm" disabled={disabled || selectedCount === 0} onClick={onMarkSelected}><CheckCheck size={15} />Chấm đã chọn ({selectedCount})</button>
      <button type="button" className="btn btn-outline btn-sm" disabled={disabled || pendingCount === 0} onClick={onMarkAll} title={`Chấm ${pendingCount} bài chờ với 100 điểm`}><Zap size={15} />Chấm tất cả 100</button>
    </div>
    <span className="batch-actions-divider" aria-hidden="true" />
    <div className="batch-actions-group" role="group" aria-label="Chấm bằng AI">
      <button type="button" className="btn btn-outline btn-outline-primary btn-sm" disabled={disabled || selectedCount === 0 || jobActive} onClick={onAiSelected}><Sparkles size={15} />AI Chấm đã chọn ({selectedCount})</button>
      <button type="button" className="btn btn-primary btn-sm" disabled={disabled || pendingCount === 0 || jobActive} onClick={onAiAll}><Sparkles size={15} />AI Chấm tất cả</button>
    </div>
  </div>;
}
