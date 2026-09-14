import { Dialog } from '../../components/ui/Dialog';

export interface PastSlotComment {
  slotNumber: number;
  content: string;
}

export function PastCommentsDialog({
  open,
  studentName,
  pastComments,
  onClose,
}: {
  open: boolean;
  studentName: string;
  pastComments: PastSlotComment[];
  onClose: () => void;
}) {
  return (
    <Dialog open={open} title="Lịch sử nhận xét" onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <div style={{ fontWeight: 600, marginBottom: 12, color: 'var(--primary)' }}>
        {studentName}
      </div>
      <div className="confirm-preview" style={{ maxHeight: 380, overflowY: 'auto' }}>
        {pastComments.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--gray-500)', padding: 20 }}>
            Chưa có nhận xét nào từ các buổi trước
          </div>
        ) : (
          pastComments.map((item) => (
            <div
              className="confirm-preview-item"
              key={item.slotNumber}
              style={{
                marginBottom: 10,
                padding: 10,
                background: 'var(--surface-subtle)',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div
                className="confirm-preview-name"
                style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: 'var(--text-heading)' }}
              >
                Buổi {item.slotNumber}
              </div>
              <div
                className="confirm-preview-comment"
                style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}
              >
                {item.content || 'Không có nhận xét'}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="confirm-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Dialog>
  );
}
