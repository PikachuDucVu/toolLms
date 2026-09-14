import type { GradingJobResponse, HomeworkLoadResponse, HomeworkSubmission } from '@tool-lms/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../components/ui/Toast';
import { ApiError } from '../../lib/apiError';
import { captureHomeworkContext, createHomeworkOperationController, isCurrentHomeworkContext, releaseHomeworkOperationController, type HomeworkContextSnapshot } from './homeworkContext';
import { runtimeRoutes } from '../../lib/runtimeRoutes';
import { aiGradeHomework, batchMarkHomework, cancelGradingJob, createGradingJob, getDownloadUrl, markHomework, retryGradingJob } from './api';
import { BatchActions } from './BatchActions';
import { GradingJobProgress } from './GradingJobProgress';
import { effectiveApiKey, HomeworkConfig, initialHomeworkAiOptions, type HomeworkAiOptions } from './HomeworkConfig';
import { HomeworkFilters } from './HomeworkFilters';
import { gradingJobQuery, homeworkClassesQuery, homeworkQuery } from './queries';
import { filterHomeworkSubmissions, homeworkStats, lessonById, pendingSubmissions, selectedVisibleSubmissions, studentById, uploadSubmissions } from './selectors';
import { SubmissionTable } from './SubmissionTable';
import { useHomeworkStore, type FrozenGradingScope } from './store';
import { useGradingJob } from './useGradingJob';

export function HomeworkPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [aiOptions, setAiOptions] = useState<HomeworkAiOptions>(initialHomeworkAiOptions);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [jobActionError, setJobActionError] = useState<unknown>(null);
  const classId = useHomeworkStore((state) => state.classId);
  const lessonId = useHomeworkStore((state) => state.lessonId);
  const status = useHomeworkStore((state) => state.status);
  const drafts = useHomeworkStore((state) => state.drafts);
  const selectedIds = useHomeworkStore((state) => state.selectedIds);
  const batchScore = useHomeworkStore((state) => state.batchScore);
  const activeJobId = useHomeworkStore((state) => state.activeJobId);
  const frozenRetryScope = useHomeworkStore((state) => state.frozenRetryScope);

  useEffect(() => {
    if (!auth.loading && !auth.session && auth.error instanceof ApiError && auth.error.code === 'AUTH_REQUIRED') navigate(runtimeRoutes().loginForHomework, { replace: true });
  }, [auth.error, auth.loading, auth.session, navigate]);

  const classes = useQuery({ ...homeworkClassesQuery(), enabled: Boolean(auth.session) });
  const homework = useQuery({ ...homeworkQuery(classId), enabled: Boolean(auth.session && classId) });
  const allSubmissions = useMemo(() => uploadSubmissions(homework.data?.data.submissions), [homework.data]);
  const filtered = useMemo(() => filterHomeworkSubmissions(allSubmissions, lessonId, status), [allSubmissions, lessonId, status]);
  const stats = useMemo(() => homeworkStats(allSubmissions), [allSubmissions]);
  const students = homework.data?.data.students || [];
  const lessons = homework.data?.data.lessons || [];

  useEffect(() => {
    if (homework.data?.data.classId === classId) useHomeworkStore.getState().hydrateDrafts(uploadSubmissions(homework.data.data.submissions));
  }, [classId, homework.data, homework.dataUpdatedAt]);

  useEffect(() => {
    setBusyId(null);
    setJobActionError(null);
  }, [classId]);

  const terminalJob = useCallback((jobClassId: string, jobStatus: 'completed' | 'cancelled') => {
    if (useHomeworkStore.getState().classId !== jobClassId) return;
    void queryClient.invalidateQueries({ queryKey: homeworkQuery(jobClassId).queryKey, exact: true });
    toast.show(jobStatus === 'cancelled' ? 'Đã ghi nhận yêu cầu hủy job AI.' : 'AI đã hoàn tất chấm bài.', jobStatus === 'cancelled' ? 'info' : 'success');
  }, [queryClient, toast]);
  const jobQuery = useGradingJob(terminalJob);

  const markMutation = useMutation({ mutationFn: ({ requestClassId, submission, score, note, signal }: { requestClassId: string; submission: HomeworkSubmission; score: number; note: string; signal: AbortSignal }) => markHomework({ classId: requestClassId, id: submission.id, score, note }, signal), retry: false });
  const batchMutation = useMutation({ mutationFn: ({ requestClassId, submissions, signal }: { requestClassId: string; submissions: Array<{ id: string; score: number; note: string }>; signal: AbortSignal }) => batchMarkHomework({ classId: requestClassId, submissions }, signal), retry: false });
  const aiMutation = useMutation({ mutationFn: ({ requestClassId, submission, studentName, lessonName, options, signal }: { requestClassId: string; submission: HomeworkSubmission; studentName: string; lessonName: string; options: HomeworkAiOptions; signal: AbortSignal }) => aiGradeHomework({ classId: requestClassId, submissionId: submission.id, lessonName, studentName, modelId: options.aiModel, customModelId: options.customModelId, thinkingLevel: options.thinkingLevel, ...apiKeyField(options.apiKey) }, signal), retry: false });
  const createJobMutation = useMutation({ mutationFn: ({ scope, apiKey, signal }: { scope: FrozenGradingScope; apiKey: string; signal: AbortSignal }) => createGradingJob({ ...scope, ...apiKeyField(apiKey) }, signal), retry: false });
  const cancelMutation = useMutation({ mutationFn: ({ jobId, signal }: { jobId: string; signal: AbortSignal }) => cancelGradingJob(jobId, signal), retry: false });
  const retryMutation = useMutation({ mutationFn: ({ jobId, scope, apiKey, signal }: { jobId: string; scope: FrozenGradingScope; apiKey: string; signal: AbortSignal }) => {
    const { classId: _classId, ...retryScope } = scope;
    return retryGradingJob(jobId, { ...retryScope, ...apiKeyField(apiKey) }, signal);
  }, retry: false });

  const refresh = async () => {
    await classes.refetch();
    if (classId) await homework.refetch();
  };

  const markSingle = async (submission: HomeworkSubmission) => {
    const draft = drafts[submission.id];
    const score = validScore(draft?.score);
    if (score == null) return toast.show('Điểm phải từ 0 đến 100', 'error');
    const note = draft?.note.trim() || '';
    const context = captureHomeworkContext(classId);
    if (!isCurrentHomeworkContext(context)) return;
    const controller = createHomeworkOperationController();
    setBusyId(submission.id);
    try {
      const response = await markMutation.mutateAsync({ requestClassId: context.classId, submission, score, note, signal: controller.signal });
      if (!isCurrentHomeworkContext(context)) return;
      const persisted = { id: submission.id, score: response.data.submission.score, note };
      updateHomeworkCache(queryClient, context.classId, (item) => item.id === submission.id ? { ...item, status: 'MARKED', score: persisted.score, note: persisted.note, markedAt: response.data.submission.markedAt, markedBy: response.data.submission.markedBy } : item);
      useHomeworkStore.getState().reconcilePersistedDrafts([persisted]);
      if (useHomeworkStore.getState().status === 'SUBMITTED') useHomeworkStore.getState().setStatusAfterMark('');
      toast.show(`Đã chấm ${score} điểm!`);
    } catch (error) {
      if (isCurrentHomeworkContext(context) && !controller.signal.aborted) toast.show(error instanceof Error ? `Lỗi: ${error.message}` : 'Lỗi chấm điểm', 'error');
    } finally {
      releaseHomeworkOperationController(controller);
      if (isCurrentHomeworkContext(context)) setBusyId(null);
    }
  };

  const markSelected = async () => {
    const score = validScore(batchScore);
    if (score == null) return toast.show('Điểm phải từ 0 đến 100', 'error');
    const selected = selectedVisibleSubmissions(allSubmissions, selectedIds);
    if (!selected.length) return toast.show('Chưa chọn bài nào', 'error');
    const context = captureHomeworkContext(classId);
    if (!(await confirm({ title: 'Chấm bài đã chọn', description: `Chấm ${selected.length} bài đã chọn với ${score} điểm?`, confirmLabel: `Chấm ${selected.length} bài` }))) return;
    if (!isCurrentHomeworkContext(context)) return;
    await runBatchMark(selected.map((item) => ({ id: item.id, score, note: drafts[item.id]?.note || '' })), context, false);
  };

  const markAll = async () => {
    const pending = pendingSubmissions(allSubmissions);
    if (!pending.length) return toast.show('Không có bài chờ chấm', 'error');
    const context = captureHomeworkContext(classId);
    if (!(await confirm({ title: 'Chấm hàng loạt', description: `Bạn có chắc muốn chấm ${pending.length} bài với 100 điểm?`, confirmLabel: `Chấm ${pending.length} bài` }))) return;
    if (!isCurrentHomeworkContext(context)) return;
    await runBatchMark(pending.map((item) => ({ id: item.id, score: 100, note: '' })), context, true);
  };

  const runBatchMark = async (items: Array<{ id: string; score: number; note: string }>, context: HomeworkContextSnapshot, reload: boolean) => {
    if (!isCurrentHomeworkContext(context)) return;
    const controller = createHomeworkOperationController();
    try {
      const response = await batchMutation.mutateAsync({ requestClassId: context.classId, submissions: items, signal: controller.signal });
      if (!isCurrentHomeworkContext(context)) return;
      const requested = new Map(items.map((item) => [item.id, item]));
      const successes = new Map(response.data.results.filter((result) => result.success).map((result) => [result.id, result]));
      const persisted = Array.from(successes.values()).flatMap((result) => {
        const submitted = requested.get(result.id);
        return result.success && submitted ? [{ id: result.id, score: result.submission.score, note: submitted.note }] : [];
      });
      updateHomeworkCache(queryClient, context.classId, (item) => {
        const result = successes.get(item.id);
        const submitted = requested.get(item.id);
        return result?.success && submitted ? { ...item, status: 'MARKED', score: result.submission.score, note: submitted.note, markedAt: result.submission.markedAt, markedBy: result.submission.markedBy } : item;
      });
      useHomeworkStore.getState().reconcilePersistedDrafts(persisted);
      if (!reload && useHomeworkStore.getState().status === 'SUBMITTED') useHomeworkStore.getState().setStatusAfterMark('');
      toast.show(`Đã chấm ${response.data.successCount}/${response.data.total} bài!`, response.data.failureCount ? 'info' : 'success');
      if (reload) await queryClient.refetchQueries({ queryKey: homeworkQuery(context.classId).queryKey, exact: true });
    } catch (error) {
      if (isCurrentHomeworkContext(context) && !controller.signal.aborted) toast.show(error instanceof Error ? `Lỗi: ${error.message}` : 'Lỗi chấm điểm', 'error');
    } finally { releaseHomeworkOperationController(controller); }
  };

  const aiGradeSingle = async (submission: HomeworkSubmission) => {
    const context = captureHomeworkContext(classId);
    if (!isCurrentHomeworkContext(context)) return;
    const studentName = studentById(students, submission.studentUid)?.displayName || '';
    const lessonName = lessonById(lessons, submission.lessonId)?.name || '';
    const options = { ...aiOptions };
    const controller = createHomeworkOperationController();
    setBusyId(submission.id);
    try {
      const response = await aiMutation.mutateAsync({ requestClassId: context.classId, submission, studentName, lessonName, options, signal: controller.signal });
      if (!isCurrentHomeworkContext(context)) return;
      useHomeworkStore.getState().setScoreDraft(submission.id, String(response.data.score));
      useHomeworkStore.getState().setNoteDraft(submission.id, response.data.note);
      toast.show(`AI đề xuất ${response.data.score} điểm. Kiểm tra rồi bấm "Gửi".`, 'info');
    } catch (error) {
      if (isCurrentHomeworkContext(context) && !controller.signal.aborted) toast.show(error instanceof Error ? error.message : 'AI lỗi', 'error');
    } finally {
      releaseHomeworkOperationController(controller);
      if (isCurrentHomeworkContext(context)) setBusyId(null);
    }
  };

  const startBatchAi = async (scopeSubmissions: HomeworkSubmission[], selected: boolean) => {
    if (!scopeSubmissions.length) return toast.show(selected ? 'Chưa chọn bài nào' : 'Không có bài chờ chấm', 'error');
    const context = captureHomeworkContext(classId);
    const scope: FrozenGradingScope = { classId: context.classId, submissions: scopeSubmissions, students, lessons, modelId: aiOptions.aiModel, customModelId: aiOptions.customModelId, thinkingLevel: aiOptions.thinkingLevel };
    const apiKey = aiOptions.apiKey;
    const accepted = await confirm({ title: selected ? 'AI chấm bài đã chọn' : 'AI chấm tất cả bài chờ', description: `AI sẽ chấm ${scopeSubmissions.length} bài${selected ? ' đã chọn' : ' chờ'}. Tiếp tục?`, confirmLabel: selected ? 'AI chấm' : 'AI chấm tất cả' });
    if (!accepted || !isCurrentHomeworkContext(context)) return;
    useHomeworkStore.getState().retainJobScope(scope);
    setJobActionError(null);
    const controller = createHomeworkOperationController();
    try {
      const response = await createJobMutation.mutateAsync({ scope, apiKey, signal: controller.signal });
      if (!isCurrentHomeworkContext(context)) return;
      useHomeworkStore.getState().startJob(response.data.job.id, scope);
      toast.show(`Đã tạo job AI cho ${scopeSubmissions.length} bài. Đang xử lý...`, 'info');
    } catch (error) {
      if (!isCurrentHomeworkContext(context) || controller.signal.aborted) return;
      const recoverableJobId = enqueueFailureJobId(error);
      if (recoverableJobId) {
        useHomeworkStore.getState().startJob(recoverableJobId, scope);
        setJobActionError(error);
        toast.show('Job chỉ được đưa một phần vào hàng đợi. Có thể thử lại các bài lỗi.', 'error');
      } else {
        setJobActionError(error);
        toast.show(error instanceof Error ? error.message : 'Không tạo được job AI', 'error');
      }
    } finally { releaseHomeworkOperationController(controller); }
  };

  const cancelJob = async () => {
    if (!activeJobId) return;
    const context = captureHomeworkContext(classId);
    if (!isCurrentHomeworkContext(context)) return;
    setJobActionError(null);
    const controller = createHomeworkOperationController();
    try {
      const response = await cancelMutation.mutateAsync({ jobId: activeJobId, signal: controller.signal });
      if (!isCurrentHomeworkContext(context) || useHomeworkStore.getState().activeJobId !== activeJobId) return;
      mergeJobCache(queryClient, activeJobId, response.data.job);
      toast.show('Đã gửi yêu cầu hủy. Kết quả hoàn tất trước thời điểm hủy vẫn được giữ.', 'info');
      terminalJob(response.data.job.classId, 'cancelled');
    } catch (error) {
      if (isCurrentHomeworkContext(context) && !controller.signal.aborted) setJobActionError(error);
    } finally { releaseHomeworkOperationController(controller); }
  };

  const retryFailed = async () => {
    if (!activeJobId || !frozenRetryScope) return;
    const context = captureHomeworkContext(classId);
    if (!isCurrentHomeworkContext(context)) return;
    setJobActionError(null);
    const controller = createHomeworkOperationController();
    try {
      const response = await retryMutation.mutateAsync({ jobId: activeJobId, scope: frozenRetryScope, apiKey: aiOptions.apiKey, signal: controller.signal });
      if (!isCurrentHomeworkContext(context) || useHomeworkStore.getState().activeJobId !== activeJobId) return;
      mergeJobCache(queryClient, activeJobId, response.data.job);
      toast.show(`Đã đưa lại ${response.data.queued} bài lỗi vào hàng đợi.`, 'info');
      jobQuery.restart();
    } catch (error) {
      if (isCurrentHomeworkContext(context) && !controller.signal.aborted) {
        setJobActionError(error);
        toast.show(error instanceof ApiError && error.code === 'API_KEY_REQUIRED' ? 'Cần API key để thử lại job này.' : error instanceof Error ? error.message : 'Không thể thử lại job', 'error');
      }
    } finally { releaseHomeworkOperationController(controller); }
  };

  const download = async (submission: HomeworkSubmission, key: string) => {
    const context = captureHomeworkContext(classId);
    if (!isCurrentHomeworkContext(context)) return;
    const controller = createHomeworkOperationController();
    try {
      const response = await getDownloadUrl(context.classId, submission.id, key, controller.signal);
      if (isCurrentHomeworkContext(context)) window.open(response.data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      if (isCurrentHomeworkContext(context) && !controller.signal.aborted) toast.show(error instanceof Error ? `Lỗi: ${error.message}` : 'Không thể lấy đường dẫn tải', 'error');
    } finally { releaseHomeworkOperationController(controller); }
  };

  if (classes.error && auth.session) return <main className="homework-page"><HomeworkConfig value={aiOptions} onChange={setAiOptions} /><ErrorState error={classes.error} onRetry={() => void classes.refetch()} /></main>;

  return <main className="homework-page" aria-label="Chấm bài tập">
    <HomeworkConfig value={aiOptions} onChange={setAiOptions} />
    {stats.total > 0 && <section className="stats-bar" aria-label="Thống kê bài nộp"><Stat label="Tổng bài nộp" value={stats.total} /><Stat label="Chờ chấm" value={stats.pending} tone="warning" /><Stat label="Đã chấm" value={stats.marked} tone="success" /></section>}
    <HomeworkFilters classes={classes.data?.data.classes || []} lessons={lessons} refreshing={classes.isFetching || homework.isFetching} onRefresh={() => void refresh()} />
    {activeJobId && <GradingJobProgress response={jobQuery.data} polling={jobQuery.isFetching} pollError={jobQuery.pollError} actionError={jobActionError} cancelling={cancelMutation.isPending} retrying={retryMutation.isPending} onCancel={() => void cancelJob()} onRetry={() => void retryFailed()} onResume={jobQuery.restart} onClose={() => { useHomeworkStore.getState().clearJob(); setJobActionError(null); }} />}
    <SubmissionTable classSelected={Boolean(classId)} submissions={filtered} students={students} lessons={lessons} loading={Boolean(classId && homework.isPending)} error={homework.error} busyId={busyId} onRetry={() => void homework.refetch()} onMark={(submission) => void markSingle(submission)} onAiGrade={(submission) => void aiGradeSingle(submission)} onDownload={(submission, key) => void download(submission, key)} actions={<BatchActions jobActive={Boolean(activeJobId)} onMarkSelected={() => void markSelected()} onMarkAll={() => void markAll()} onAiSelected={() => void startBatchAi(selectedVisibleSubmissions(allSubmissions, selectedIds), true)} onAiAll={() => void startBatchAi(pendingSubmissions(allSubmissions), false)} />} />
  </main>;
}

function Stat({ label, value, tone = '' }: { label: string; value: number; tone?: string }) { return <div className="stat-item"><span className="stat-label">{label}</span><strong className={`stat-value ${tone}`}>{value}</strong></div>; }
function validScore(value: string | undefined): number | null { if (value == null || value.trim() === '') return null; const score = Number(value); return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null; }
function apiKeyField(input: string): { apiKey?: string } { const apiKey = effectiveApiKey(input); return apiKey ? { apiKey } : {}; }
function enqueueFailureJobId(error: unknown): string | null { if (!(error instanceof ApiError) || error.code !== 'UPSTREAM_ERROR' || !error.details || typeof error.details !== 'object') return null; const value = (error.details as { jobId?: unknown }).jobId; return typeof value === 'string' && value ? value : null; }

function updateHomeworkCache(queryClient: ReturnType<typeof useQueryClient>, classId: string, update: (submission: HomeworkSubmission) => HomeworkSubmission) {
  queryClient.setQueryData<HomeworkLoadResponse>(homeworkQuery(classId).queryKey, (current) => current ? { ...current, data: { ...current.data, submissions: current.data.submissions.map(update) } } : current);
}

function mergeJobCache(queryClient: ReturnType<typeof useQueryClient>, jobId: string, job: GradingJobResponse['data']['job']) {
  queryClient.setQueryData<GradingJobResponse>(gradingJobQuery(jobId).queryKey, (current) => current ? { ...current, data: { ...current.data, job } } : current);
}
