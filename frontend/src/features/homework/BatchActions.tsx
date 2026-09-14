import { CheckCheck, Sparkles, Zap } from 'lucide-react';
import { useHomeworkStore } from './store';

export function BatchActions({ jobActive, onMarkSelected, onMarkAll, onAiSelected, onAiAll }: {
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
    <input aria-label="Điểm chấm hàng loạt" type="number" className="score-input" min="0" max="100" value={batchScore} onChange={(event) => setBatchScore(event.target.value)} />
    <button className="btn btn-success btn-sm" disabled={selectedCount === 0} onClick={onMarkSelected}><CheckCheck size={15} />Chấm đã chọn ({selectedCount})</button>
    <button className="btn btn-warning btn-sm" onClick={onMarkAll}><Zap size={15} />Chấm tất cả 100</button>
    <button className="btn btn-primary btn-sm" disabled={selectedCount === 0 || jobActive} onClick={onAiSelected}><Sparkles size={15} />AI Chấm đã chọn ({selectedCount})</button>
    <button className="btn btn-primary btn-sm" disabled={jobActive} onClick={onAiAll}><Sparkles size={15} />AI Chấm tất cả</button>
  </div>;
}
