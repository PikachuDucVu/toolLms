import type { GradingJobResponse, HomeworkLoadResponse, HomeworkSubmission } from '@tool-lms/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../components/ui/Toast';
import { ApiError } from '../../lib/apiError';
import { captureHomeworkContext, createHomeworkOperationController, isCurrentHomeworkContext, releaseHomeworkOperationController, type HomeworkContextSnapshot } from './homeworkContext';
import { readHomeworkClassId, writeHomeworkClassId } from '../../lib/persistence';
import { runtimeRoutes } from '../../lib/runtimeRoutes';
import { batchMarkHomework, cancelGradingJob, createGradingJob, getDownloadUrl, markHomework, retryGradingJob } from './api';
import { BatchActions } from './BatchActions';
import { BatchQueueDock } from './BatchQueueDock';
import { GradingJobProgress } from './GradingJobProgress';
import { effectiveApiKey, HomeworkConfig, initialHomeworkAiOptions, type HomeworkAiOptions } from './HomeworkConfig';
import { HomeworkFilters } from './HomeworkFilters';
import { HomeworkSidebar } from './HomeworkSidebar';
import { gradingJobQuery, homeworkClassesQuery, homeworkJobsQuery, homeworkQuery, homeworkScoreLogQuery } from './queries';
import { filterHomeworkSubmissions, homeworkStats, lessonById, pendingSubmissions, selectedVisibleSubmissions, studentById, uploadSubmissions } from './selectors';
import { SubmissionTable } from './SubmissionTable';
import { useHomeworkStore, type FrozenGradingScope } from './store';
import { useGradingJob } from './useGradingJob';
import { isActiveJob, isBatchJob, marksOnLms, QUEUE_POLL_INTERVAL_MS, useHomeworkQueue } from './useHomeworkQueue';

export function HomeworkPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [aiOptions, setAiOptions] = useState<HomeworkAiOptions>(initialHomeworkAiOptions);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [queueingIds, setQueueingIds] = useState<ReadonlySet<string>>(() => new Set());
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

  // Reopen the class this teacher last graded, so a reload lands on the same queue and history.
  const email = auth.session?.email || '';
  const restoredFor = useRef('');
  useEffect(() => {
    if (!email || restoredFor.current === email) return;
    restoredFor.current = email;
    const saved = readHomeworkClassId(email);
    if (saved && !useHomeworkStore.getState().classId) useHomeworkStore.getState().setClassId(saved);
  }, [email]);
  useEffect(() => {
    if (email && restoredFor.current === email) writeHomeworkClassId(email, useHomeworkStore.getState().classId);
  }, [classId, email]);

  const classes = useQuery({ ...homeworkClassesQuery(), enabled: Boolean(auth.session) });
  const homework = useQuery({ ...homeworkQuery(classId), enabled: Boolean(auth.session && classId) });
  const allSubmissions = useMemo(() => uploadSubmissions(homework.data?.data.submissions), [homework.data]);
  const filtered = useMemo(() => filterHomeworkSubmissions(allSubmissions, lessonId, status), [allSubmissions, lessonId, status]);
  const stats = useMemo(() => homeworkStats(allSubmissions), [allSubmissions]);
  const students = useMemo(() => homework.data?.data.students || [], [homework.data]);
  const lessons = useMemo(() => homework.data?.data.lessons || [], [homework.data]);
  const homeworkReady = homework.data?.data.classId === classId;

  useEffect(() => {
    const list = classes.data?.data.classes;
    if (list && classId && !list.some((item) => item.id === classId)) useHomeworkStore.getState().setClassId('');
  }, [classId, classes.data]);

  const queue = useHomeworkQueue({ enabled: Boolean(auth.session), classId, submissions: allSubmissions, students, homeworkReady });
  // Any job that writes scores (batch or per-row "AI chấm & gửi") keeps the score history live;
  // only a running batch blocks starting another batch.
  const markJobRunning = queue.jobs.some((entry) => marksOnLms(entry) && isActiveJob(entry));
  const batchJobRunning = queue.jobs.some((entry) => isBatchJob(entry) && isActiveJob(entry));
  const scoreLog = useQuery({ ...homeworkScoreLogQuery(classId), enabled: Boolean(auth.session && classId), refetchInterval: markJobRunning ? QUEUE_POLL_INTERVAL_MS : false });
  const busyIds = useMemo(() => {
    const ids = new Set([...queue.busyIds, ...queueingIds]);
    if (busyId) ids.add(busyId);
    return ids;
  }, [busyId, queue.busyIds, queueingIds]);

  useEffect(() => {
    if (homework.data?.data.classId === classId) useHomeworkStore.getState().hydrateDrafts(uploadSubmissions(homework.data.data.submissions));
  }, [classId, homework.data, homework.dataUpdatedAt]);

  useEffect(() => {
    setBusyId(null);
    setQueueingIds(new Set());
    setJobActionError(null);
  }, [classId]);

  // After a reload or a class switch, pick the running batch job back up so its controls return.
  useEffect(() => {
    if (activeJobId || !homeworkReady) return;
    const running = queue.jobs.find((entry) => isBatchJob(entry) && isActiveJob(entry));
    if (!running) return;
    const ids = new Set(running.items.map((item) => item.submissionId));
    const scopeSubmissions = allSubmissions.filter((submission) => ids.has(submission.id));
    if (!scopeSubmissions.length) return;
    useHomeworkStore.getState().startJob(running.job.id, { classId, kind: running.job.kind, submissions: scopeSubmissions, students, lessons, modelId: aiOptions.aiModel, customModelId: aiOptions.customModelId, thinkingLevel: aiOptions.thinkingLevel });
  }, [activeJobId, aiOptions, allSubmissions, classId, homeworkReady, lessons, queue.jobs, students]);

  const refreshQueue = useCallback((jobClassId: string) => {
    void queryClient.invalidateQueries({ queryKey: homeworkJobsQuery(jobClassId).queryKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: homeworkScoreLogQuery(jobClassId).queryKey, exact: true });
  }, [queryClient]);

  const terminalJob = useCallback((jobClassId: string, jobStatus: 'completed' | 'cancelled') => {
    if (useHomeworkStore.getState().classId !== jobClassId) return;
    void queryClient.invalidateQueries({ queryKey: homeworkQuery(jobClassId).queryKey, exact: true });
    refreshQueue(jobClassId);
    toast.show(jobStatus === 'cancelled' ? 'Đã ghi nhận yêu cầu hủy job AI.' : 'AI đã hoàn tất chấm bài.', jobStatus === 'cancelled' ? 'info' : 'success');
  }, [queryClient, refreshQueue, toast]);
  const jobQuery = useGradingJob(terminalJob);

  const markMutation = useMutation({ mutationFn: ({ requestClassId, submission, score, note, signal }: { requestClassId: string; submission: HomeworkSubmission; score: number; note: string; signal: AbortSignal }) => markHomework({ classId: requestClassId, id: submission.id, score, note }, signal), retry: false });
  const batchMutation = useMutation({ mutationFn: ({ requestClassId, submissions, signal }: { requestClassId: string; submissions: Array<{ id: string; score: number; note: string }>; signal: AbortSignal }) => batchMarkHomework({ classId: requestClassId, submissions }, signal), retry: false });
  const createJobMutation = useMutation({ mutationFn: ({ scope, apiKey, signal }: { scope: FrozenGradingScope; apiKey: string; signal: AbortSignal }) => createGradingJob({ ...scope, ...apiKeyField(apiKey) }, signal), retry: false });
  const cancelMutation = useMutation({ mutationFn: ({ jobId, signal }: { jobId: string; signal: AbortSignal }) => cancelGradingJob(jobId, signal), retry: false });
  const retryMutation = useMutation({ mutationFn: ({ jobId, scope, apiKey, signal }: { jobId: string; scope: FrozenGradingScope; apiKey: string; signal: AbortSignal }) => {
    const { classId: _classId, ...retryScope } = scope;
    return retryGradingJob(jobId, { ...retryScope, ...apiKeyField(apiKey) }, signal);
  }, retry: false });

  const refresh = async () => {
    await classes.refetch();
    if (classId) await Promise.all([homework.refetch(), queue.refetch(), scoreLog.refetch()]);
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
      refreshQueue(context.classId);
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
      refreshQueue(context.classId);
      toast.show(`Đã chấm ${response.data.successCount}/${response.data.total} bài!`, response.data.failureCount ? 'info' : 'success');
      if (reload) await queryClient.refetchQueries({ queryKey: homeworkQuery(context.classId).queryKey, exact: true });
    } catch (error) {
      if (isCurrentHomeworkContext(context) && !controller.signal.aborted) toast.show(error instanceof Error ? `Lỗi: ${error.message}` : 'Lỗi chấm điểm', 'error');
    } finally { releaseHomeworkOperationController(controller); }
  };

  // A per-row AI click is queued on the server as a one-item job, so it keeps running and shows
  // up again after a reload. "AI" only fills the draft for review; "AI chấm & gửi" also marks it.
  const aiGradeSingle = async (submission: HomeworkSubmission, submit = false) => {
    const context = captureHomeworkContext(classId);
    if (!isCurrentHomeworkContext(context)) return;
    const scope: FrozenGradingScope = { classId: context.classId, kind: submit ? 'single_submit' : 'single', submissions: [submission], students, lessons, modelId: aiOptions.aiModel, customModelId: aiOptions.customModelId, thinkingLevel: aiOptions.thinkingLevel };
    const studentName = studentById(students, submission.studentUid)?.displayName || 'học sinh';
    const controller = createHomeworkOperationController();
    setQueueingIds((current) => new Set(current).add(submission.id));
    try {
      await createJobMutation.mutateAsync({ scope, apiKey: aiOptions.apiKey, signal: controller.signal });
      if (!isCurrentHomeworkContext(context)) return;
      toast.show(submit ? `Đã đưa bài của ${studentName} vào hàng đợi AI (chấm xong sẽ tự gửi).` : `Đã đưa bài của ${studentName} vào hàng đợi AI.`, 'info');
      await queryClient.invalidateQueries({ queryKey: homeworkJobsQuery(context.classId).queryKey, exact: true });
    } catch (error) {
      if (!isCurrentHomeworkContext(context) || controller.signal.aborted) return;
      if (enqueueFailureJobId(error)) void queryClient.invalidateQueries({ queryKey: homeworkJobsQuery(context.classId).queryKey, exact: true });
      toast.show(error instanceof ApiError && error.code === 'API_KEY_REQUIRED' ? 'Cần API key để dùng model đã chọn.' : error instanceof Error ? error.message : 'AI lỗi', 'error');
    } finally {
      releaseHomeworkOperationController(controller);
      if (isCurrentHomeworkContext(context)) setQueueingIds((current) => { const next = new Set(current); next.delete(submission.id); return next; });
    }
  };

  const startBatchAi = async (scopeSubmissions: HomeworkSubmission[], selected: boolean) => {
    if (!scopeSubmissions.length) return toast.show(selected ? 'Chưa chọn bài nào' : 'Không có bài chờ chấm', 'error');
    const context = captureHomeworkContext(classId);
    const scope: FrozenGradingScope = { classId: context.classId, kind: selected ? 'selected' : 'all', submissions: scopeSubmissions, students, lessons, modelId: aiOptions.aiModel, customModelId: aiOptions.customModelId, thinkingLevel: aiOptions.thinkingLevel };
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
      refreshQueue(context.classId);
      toast.show(`Đã tạo job AI cho ${scopeSubmissions.length} bài. Đang xử lý...`, 'info');
    } catch (error) {
      if (!isCurrentHomeworkContext(context) || controller.signal.aborted) return;
      const recoverableJobId = enqueueFailureJobId(error);
      if (recoverableJobId) {
        useHomeworkStore.getState().startJob(recoverableJobId, scope);
        refreshQueue(context.classId);
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
      refreshQueue(context.classId);
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

  // Until the tracked job's own poll lands, show what the queue listing already knows about it.
  const listedActiveJob = queue.jobs.find((entry) => entry.job.id === activeJobId);
  const jobResponse = jobQuery.data ?? (listedActiveJob ? { success: true as const, data: listedActiveJob, requestId: 'queue-list' } : undefined);
  const jobProgress = activeJobId ? <GradingJobProgress response={jobResponse} polling={jobQuery.isFetching} pollError={jobQuery.pollError} actionError={jobActionError} cancelling={cancelMutation.isPending} retrying={retryMutation.isPending} onCancel={() => void cancelJob()} onRetry={() => void retryFailed()} onResume={jobQuery.restart} onClose={() => { useHomeworkStore.getState().clearJob(); setJobActionError(null); }} /> : null;

  return <main className="homework-page" aria-label="Chấm bài tập">
    <HomeworkConfig value={aiOptions} onChange={setAiOptions} />
    <div className="homework-main">
      <HomeworkFilters classes={classes.data?.data.classes || []} lessons={lessons} refreshing={classes.isFetching || homework.isFetching} onRefresh={() => void refresh()} />
      <SubmissionTable classSelected={Boolean(classId)} submissions={filtered} students={students} lessons={lessons} loading={Boolean(classId && homework.isPending)} error={homework.error} busyIds={busyIds} onRetry={() => void homework.refetch()} onMark={(submission) => void markSingle(submission)} onAiGrade={(submission) => void aiGradeSingle(submission)} onAiGradeSubmit={(submission) => void aiGradeSingle(submission, true)} onDownload={(submission, key) => void download(submission, key)} summary={stats.total > 0 && <div className="homework-stats" role="group" aria-label="Thống kê bài nộp"><Stat label="Tổng bài nộp" value={stats.total} /><Stat label="Chờ chấm" value={stats.pending} tone="warning" /><Stat label="Đã chấm" value={stats.marked} tone="success" /></div>} actions={<BatchActions disabled={!classId || !allSubmissions.length} pendingCount={stats.pending} jobActive={Boolean(activeJobId) || batchJobRunning} onMarkSelected={() => void markSelected()} onMarkAll={() => void markAll()} onAiSelected={() => void startBatchAi(selectedVisibleSubmissions(allSubmissions, selectedIds), true)} onAiAll={() => void startBatchAi(pendingSubmissions(allSubmissions), false)} />} />
    </div>
    <HomeworkSidebar classSelected={Boolean(classId)} jobs={queue.jobs} jobsLoading={Boolean(classId) && queue.isPending} students={students} lessons={lessons} scoreLog={scoreLog.data?.data.entries || []} scoreLogLoading={Boolean(classId) && scoreLog.isPending} scoreLogError={scoreLog.error} scoreLogRefreshing={scoreLog.isFetching} onRefreshScoreLog={() => void scoreLog.refetch()} />
    {classId && <BatchQueueDock jobs={queue.jobs} activeJobId={activeJobId} activeJobSlot={jobProgress} students={students} lessons={lessons} />}
  </main>;
}

function Stat({ label, value, tone = '' }: { label: string; value: number; tone?: string }) { return <div className={`homework-stat ${tone}`}><span className="homework-stat-label">{label}</span><strong className="homework-stat-value">{value}</strong></div>; }
function validScore(value: string | undefined): number | null { if (value == null || value.trim() === '') return null; const score = Number(value); return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null; }
function apiKeyField(input: string): { apiKey?: string } { const apiKey = effectiveApiKey(input); return apiKey ? { apiKey } : {}; }
function enqueueFailureJobId(error: unknown): string | null { if (!(error instanceof ApiError) || error.code !== 'UPSTREAM_ERROR' || !error.details || typeof error.details !== 'object') return null; const value = (error.details as { jobId?: unknown }).jobId; return typeof value === 'string' && value ? value : null; }

function updateHomeworkCache(queryClient: ReturnType<typeof useQueryClient>, classId: string, update: (submission: HomeworkSubmission) => HomeworkSubmission) {
  queryClient.setQueryData<HomeworkLoadResponse>(homeworkQuery(classId).queryKey, (current) => current ? { ...current, data: { ...current.data, submissions: current.data.submissions.map(update) } } : current);
}

function mergeJobCache(queryClient: ReturnType<typeof useQueryClient>, jobId: string, job: GradingJobResponse['data']['job']) {
  queryClient.setQueryData<GradingJobResponse>(gradingJobQuery(jobId).queryKey, (current) => current ? { ...current, data: { ...current.data, job } } : current);
}
