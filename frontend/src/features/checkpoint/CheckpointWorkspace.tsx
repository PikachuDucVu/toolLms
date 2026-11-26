import type { CheckpointNumber, ClassDetail, Slot, StudentAttendance } from '@tool-lms/contracts';
import { ClipboardCheck, UserRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { readAiApiKey, readStudentNotes } from '../../lib/persistence';
import type { AttendanceFilter, ProgressFilter } from '../classes/public/domain';
import { hasAreaType, isPresent, stripHtml } from '../classes/public/domain';
import { StudentFilters } from '../classes/public/components';
import { useCommentStore } from '../comments/public/store';
import { configQuery } from '../configuration/public/api';
import { CheckpointBatchActions } from './CheckpointBatchActions';
import { CheckpointReviewDialog } from './CheckpointReviewDialog';
import { CheckpointStudentCard } from './CheckpointStudentCard';
import { activateCheckpointContext, deactivateCheckpointContext, hydrateCheckpointContext, loadCheckpointSubmissionStatus, type CheckpointGenerationOptions, type CheckpointScope } from './checkpointController';
import { useCheckpointStore } from './checkpointStore';

export function CheckpointWorkspace({ detail, slot, sessionNumber, students, search, attendance, progress, locked = false, onSearch, onAttendance, onProgress, onResetFilters }: {
  detail: ClassDetail; slot: Slot; sessionNumber: number; students: StudentAttendance[];
  search: string; attendance: AttendanceFilter; progress: ProgressFilter; locked?: boolean;
  onSearch: (value: string) => void; onAttendance: (value: AttendanceFilter) => void; onProgress: (value: ProgressFilter) => void; onResetFilters: () => void;
}) {
  const checkpoint: CheckpointNumber = sessionNumber === 5 ? 1 : 2;
  const context = useCheckpointStore((state) => state.context);
  const summaryDraft = useCheckpointStore((state) => state.summaryDraft);
  const summarySynced = useCheckpointStore((state) => state.summarySynced);
  const operationActive = useCheckpointStore((state) => state.generationBusy.size > 0 || state.submitBusy.size > 0 || state.gradeBusy.size > 0 || Boolean(state.batch));
  const config = useQuery(configQuery());
  const generationConfig = useCommentStore((state) => state.generationConfig);
  const model = generationModel(generationConfig, config.data?.data);
  const generationOptions = model.options;
  const scope: CheckpointScope = useMemo(() => ({ detail, slot, checkpoint }), [checkpoint, detail, slot]);
  const present = slot.studentAttendance.filter(isPresent);
  const results = useCheckpointStore((state) => state.results);
  const scoredCount = present.filter((student) => hasAreaType(student, 'CHECKPOINT') || Boolean(results[student.studentId])).length;
  const names = Object.fromEntries(slot.studentAttendance.map((student) => [student.studentId, student.displayName]));

  useEffect(() => {
    const activated = activateCheckpointContext(detail.id, slot.id, checkpoint, stripHtml(slot.summary));
    hydrateCheckpointContext(activated, slot, readStudentNotes(), stripHtml(slot.summary));
    void loadCheckpointSubmissionStatus({ detail, slot, checkpoint });
    return () => deactivateCheckpointContext(activated);
  }, [checkpoint, detail.id, slot.id]);

  useEffect(() => {
    if (!context || context.classId !== detail.id || context.slotId !== slot.id || context.checkpoint !== checkpoint) return;
    hydrateCheckpointContext(context, slot, readStudentNotes(), stripHtml(slot.summary));
  }, [checkpoint, context, detail.id, slot]);

  return (
    <>
      <label className="sr-only" htmlFor="checkpoint-session-summary">Tổng kết buổi Checkpoint</label>
      <textarea
        id="checkpoint-session-summary"
        className="sr-only"
        value={summaryDraft}
        onChange={(event) => useCheckpointStore.getState().setSummaryDraft(event.target.value)}
      />

      <section className="card checkpoint-workspace">
        <div className="checkpoint-banner" role="note">
          <div className="checkpoint-banner-icon" aria-hidden="true">
            <ClipboardCheck size={20} />
          </div>
          <div className="checkpoint-banner-text">
            <h3>Buổi {sessionNumber} — Checkpoint {checkpoint}</h3>
            <p>
              AI chấm bài nộp trên kiemtra hoặc nhập điểm tay (để trống = random 4–5). AI nhận xét dựa trên điểm và ghi chú.
            </p>
          </div>
          <div className="checkpoint-banner-stats" aria-label="Tiến độ Checkpoint">
            <span><b>{scoredCount}</b>/{present.length} đã gửi điểm</span>
          </div>
        </div>

        <div className="checkpoint-toolbar">
          <StudentFilters
            search={search}
            attendance={attendance}
            progress={progress}
            mode="checkpoint"
            disabled={locked || operationActive}
            onSearch={onSearch}
            onAttendance={onAttendance}
            onProgress={onProgress}
            onReset={onResetFilters}
          />
        </div>

        <div className="checkpoint-student-list">
          {!students.length ? (
            <div className="student-empty">
              <UserRound size={36} />
              <strong>
                {slot.studentAttendance.length
                  ? 'Không tìm thấy học sinh phù hợp'
                  : 'Chưa có học sinh trong buổi này'}
              </strong>
              {slot.studentAttendance.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  disabled={locked || operationActive}
                  onClick={onResetFilters}
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          ) : (
            students.map((student) => (
              <CheckpointStudentCard
                key={student.id}
                scope={scope}
                student={student}
                generationOptions={generationOptions}
                locked={locked}
              />
            ))
          )}
        </div>

        <CheckpointBatchActions
          scope={scope}
          generationOptions={generationOptions}
          presentCount={present.length}
          studentNames={names}
          disabled={locked || operationActive}
        />
      </section>

      <CheckpointReviewDialog scope={scope} generationOptions={generationOptions} sessionNumber={sessionNumber} locked={locked} />
    </>
  );
}

function generationModel(generationConfig: { modelId: string; customModelId: string; thinkingLevel: string }, serverConfig?: { aiModel: string; customModelId: string; thinkingLevel: string }) {
  const modelId = generationConfig.modelId || serverConfig?.aiModel || 'gpt-5.4';
  const customModelId = generationConfig.customModelId || serverConfig?.customModelId || '';
  const thinkingLevel = (generationConfig.thinkingLevel || serverConfig?.thinkingLevel || 'high') as CheckpointGenerationOptions['thinkingLevel'];
  const apiKey = readAiApiKey() || undefined;
  return { options: { modelId, customModelId: modelId === '__custom__' ? customModelId : undefined, thinkingLevel, apiKey } satisfies CheckpointGenerationOptions };
}
