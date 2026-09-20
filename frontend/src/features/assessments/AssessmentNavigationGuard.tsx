import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useCommentStore } from '../comments/public/store';
import { hasUnsavedCommentWork, isCommentOperationActive } from '../comments/public/controller';
import { hasUnsavedDemoWork, isDemoOperationActive, useDemoStore } from '../demo/public/store';
import { hasUnsavedCheckpointWork, isCheckpointOperationActive, useCheckpointStore } from '../checkpoint/public/store';
import { hasUnsavedAssessmentWork, isAssessmentOperationActive } from './autosaveController';

export function AssessmentNavigationGuard() {
  const confirm = useConfirm();
  const toast = useToast();
  useCommentStore((state) => state.studentBusy.size + (state.batch ? 1 : 0) + (state.summaryBusy ? 1 : 0) + Object.keys(state.drafts).length + Number(state.summaryDraft.trim() !== state.summarySynced.trim()));
  useDemoStore((state) => state.randomBusy.size + state.submitBusy.size + (state.batch ? 1 : 0) + Object.values(state.drafts).reduce((sum, draft) => sum + draft.version, 0) + Number(state.summaryDraft.trim() !== state.summarySynced.trim()));
  useCheckpointStore((state) => state.generationBusy.size + state.submitBusy.size + state.gradeBusy.size + (state.batch ? 1 : 0) + Object.values(state.drafts).reduce((sum, draft) => sum + draft.theoryVersion + draft.practiceVersion + draft.descriptionVersion + draft.commentVersion, 0) + state.summaryVersion);
  const prompting = useRef(false);
  const activeAttempt = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const destinationChanged = currentLocation.pathname !== nextLocation.pathname
      || currentLocation.search !== nextLocation.search
      || currentLocation.hash !== nextLocation.hash;
    if (!destinationChanged) return false;
    activeAttempt.current = isAssessmentOperationActive() || isCommentOperationActive() || isDemoOperationActive() || isCheckpointOperationActive();
    return activeAttempt.current || hasUnsavedAssessmentWork() || hasUnsavedCommentWork() || hasUnsavedDemoWork() || hasUnsavedCheckpointWork();
  });

  useEffect(() => {
    if (blocker.state !== 'blocked' || prompting.current) return;
    const proceed = blocker.proceed;
    const reset = blocker.reset;
    if (activeAttempt.current || isAssessmentOperationActive() || isCommentOperationActive() || isDemoOperationActive() || isCheckpointOperationActive()) {
      const checkpointBusy = isCheckpointOperationActive();
      activeAttempt.current = false;
      reset();
      toast.show(checkpointBusy ? 'Vui lòng đợi thao tác Checkpoint đang chạy hoàn tất' : 'Vui lòng đợi thao tác đang chạy hoàn tất', 'info');
      return;
    }
    activeAttempt.current = false;
    if (!hasUnsavedAssessmentWork() && !hasUnsavedCommentWork() && !hasUnsavedDemoWork() && !hasUnsavedCheckpointWork()) {
      proceed();
      return;
    }
    prompting.current = true;
    void confirm({
      title: 'Bỏ thay đổi chưa lưu?',
      description: hasUnsavedCheckpointWork() ? 'Bạn đang có tổng kết, điểm, mô tả hoặc nhận xét Checkpoint chưa gửi. Chuyển đi sẽ bỏ các thay đổi này.' : hasUnsavedDemoWork() ? 'Bạn đang có tổng kết hoặc điểm Demo chưa gửi. Chuyển đi sẽ bỏ các thay đổi này.' : 'Bạn đang có đánh giá, tổng kết hoặc bản nháp nhận xét chưa lưu. Chuyển đi sẽ bỏ các thay đổi này.',
      confirmLabel: 'Bỏ thay đổi',
    }).then((accepted) => {
      if (!accepted) {
        reset();
        return;
      }
      if (isAssessmentOperationActive() || isCommentOperationActive() || isDemoOperationActive() || isCheckpointOperationActive()) {
        const checkpointBusy = isCheckpointOperationActive();
        reset();
        toast.show(checkpointBusy ? 'Vui lòng đợi thao tác Checkpoint đang chạy hoàn tất' : 'Vui lòng đợi thao tác đang chạy hoàn tất', 'info');
        return;
      }
      proceed();
    }).finally(() => { prompting.current = false; });
  }, [blocker, confirm, toast]);

  return null;
}
