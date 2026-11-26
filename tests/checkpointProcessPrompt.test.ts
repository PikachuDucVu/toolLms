import type { CheckpointLearningProcess } from '@tool-lms/contracts';
import { describe, expect, it } from 'vitest';
import { buildLearningProcessFacts } from '../src/services/checkpointProcessPrompt';

const base: CheckpointLearningProcess = {
  fromSession: 1,
  toSession: 9,
  lateSessions: [],
  absentSessions: [],
  homework: { assignedSessions: [1, 2, 3, 6, 7], missingSessions: [] },
  sessionComments: [{ session: 6, comment: 'Con chủ động hỏi giáo viên.' }],
  previousCheckpointScore: 3.5,
};

describe('buildLearningProcessFacts', () => {
  it('skips one or two late sessions entirely', () => {
    const facts = buildLearningProcessFacts({ ...base, lateSessions: [2, 7] });
    const punctuality = facts.split('\n').find((line) => line.startsWith('- Giờ giấc')) ?? '';
    expect(punctuality).toContain('KHÔNG nhắc đến việc đi muộn');
    expect(punctuality).not.toMatch(/\d/);
  });

  it('mentions three or more late sessions only in general terms', () => {
    const facts = buildLearningProcessFacts({ ...base, lateSessions: [2, 4, 7] });
    const punctuality = facts.split('\n').find((line) => line.startsWith('- Giờ giấc')) ?? '';
    expect(punctuality).toContain('chưa thật sự đúng giờ');
    expect(punctuality).toContain('KHÔNG nêu số buổi');
    expect(punctuality).not.toMatch(/\d/);
  });

  it('names every missing homework session', () => {
    const facts = buildLearningProcessFacts({ ...base, homework: { assignedSessions: [1, 2, 3, 6, 7], missingSessions: [2, 6] } });
    expect(facts).toContain('chưa nộp BTVN buổi 2, buổi 6');
    expect(facts).toContain('đã nộp 3/5 bài');
  });

  it('praises complete homework and drops homework when it could not be loaded', () => {
    expect(buildLearningProcessFacts(base)).toContain('nộp đầy đủ BTVN');
    expect(buildLearningProcessFacts({ ...base, homework: null })).toContain('KHÔNG nhắc đến bài tập về nhà');
  });

  it('passes earlier comments and the first checkpoint score through', () => {
    const facts = buildLearningProcessFacts(base);
    expect(facts).toContain('Buổi 6: Con chủ động hỏi giáo viên.');
    expect(facts).toContain('Điểm Checkpoint 1: 3.5/5');
  });
});
