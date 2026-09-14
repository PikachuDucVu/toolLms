import type { GradingJobResponse } from '@tool-lms/contracts';
import { AlertTriangle, RefreshCw, RotateCcw, Square, X } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { safeErrorMessage } from '../../app/providers';

export function GradingJobProgress({ response, polling, pollError, actionError, cancelling, retrying, onCancel, onRetry, onResume, onClose }: {
  response?: GradingJobResponse;
  polling: boolean;
  pollError: unknown;
  actionError: unknown;
  cancelling: boolean;
  retrying: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onResume: () => void;
  onClose: () => void;
}) {
  const job = response?.data.job;
  if (!job && !pollError && !actionError) return <Card className="job-progress"><div className="job-progress-head"><div><h2>AI đang chấm bài</h2><p>Trạng thái đầu tiên sẽ được cập nhật sau 3 giây.</p></div><span className="button-spinner" /></div></Card>;
  const items = response?.data.items || [];
  const cancelledItems = items.filter((item) => item.status === 'cancelled').length;
  const done = job ? job.completedItems + job.failedItems + cancelledItems : 0;
  const percent = job?.totalItems ? Math.min(100, Math.round(done / job.totalItems * 100)) : 0;
  const terminal = job?.status === 'completed' || job?.status === 'cancelled';
  return <Card className="job-progress"><div className="job-progress-head"><div><h2>Tiến độ AI chấm bài</h2><p>{job ? `${done}/${job.totalItems} bài · ${job.completedItems} thành công · ${job.failedItems} lỗi${cancelledItems ? ` · ${cancelledItems} đã hủy` : ''}` : 'Chưa lấy được trạng thái job'}</p></div>{terminal && <button className="icon-button" aria-label="Đóng tiến độ" onClick={onClose}><X size={16} /></button>}</div>
    {job && <><div className="progress-track" aria-label={`Tiến độ ${percent}%`}><span style={{ width: `${percent}%` }} /></div><p className={`job-status job-status-${job.status}`}>{job.status === 'queued' ? 'Đang chờ xử lý' : job.status === 'running' ? 'Đang xử lý' : job.status === 'completed' ? 'Đã hoàn tất' : 'Đã yêu cầu hủy'}</p></>}
    {job?.status === 'cancelled' && <p className="job-truth-note">Các bài đã hoàn tất vẫn được giữ. Bài đang xử lý có thể hoàn tất trước khi lệnh hủy được nhận.</p>}
    {Boolean(pollError || actionError) && <div className="job-error" role="alert"><AlertTriangle size={17} /><span>{safeErrorMessage(actionError || pollError)}</span></div>}
    <div className="job-actions">{Boolean(pollError) && <button className="btn btn-outline btn-sm" onClick={onResume}><RefreshCw size={15} />Tiếp tục kiểm tra</button>}{job && !terminal && <button className="btn btn-outline btn-sm" disabled={cancelling} onClick={onCancel}><Square size={14} />{cancelling ? 'Đang hủy...' : 'Hủy job'}</button>}{job && job.failedItems > 0 && <button className="btn btn-primary btn-sm" disabled={retrying || polling} onClick={onRetry}><RotateCcw size={15} />{retrying ? 'Đang thử lại...' : `Thử lại ${job.failedItems} bài lỗi`}</button>}</div>
  </Card>;
}
