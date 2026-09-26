import type { ClassDetail, ClassSummary, Slot, StudentAttendance } from '@tool-lms/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { appQueryClient } from '../../app/providers';
import { applyOptimisticClassSubmissions, reconcileClassSubmissionsAfterRefetch, syncClassProgressFromDetail } from './classCache';
import { classDetailQuery, commentsClassesQuery } from './queries';

const pending = {
  state: 'pending' as const,
  badgeText: 'Chưa nhận xét' as const,
  slotNumber: 10,
  present: 8,
  completed: 0,
  missing: 8,
};
const done = {
  state: 'done' as const,
  badgeText: 'Đã nhận xét' as const,
  slotNumber: 10,
  present: 8,
  completed: 8,
  missing: 0,
};

function area(type = 'CONTENT', content = 'Đã gửi') {
  return {
    grade: null,
    content,
    commentAreaId: null,
    type,
    checkpoint: null,
    courseProcessDemoId: null,
    courseProcessFinalEvaluationTitle: null,
    courseProcessFinalEvaluationId: null,
    demoQuestions: [],
  };
}

function student(index: number, areas: ReturnType<typeof area>[] = []): StudentAttendance {
  return {
    id: `attendance-${index}`,
    studentId: `student-${index}`,
    displayName: `Học sinh ${index}`,
    status: 'ATTENDED',
    commentByAreas: areas,
  };
}

function slot(students: StudentAttendance[]): Slot {
  return { id: 'slot-10', index: 9, date: '2026-09-01', summary: '', studentAttendance: students };
}

function detail(students: StudentAttendance[], progress: ClassDetail['commentProgress'] = pending): ClassDetail {
  return {
    id: 'class-1',
    name: 'HDT-JSI41',
    status: 'RUNNING',
    startDate: null,
    endDate: null,
    recentlyEnded: false,
    course: { id: 'course-1', name: 'Web Developer Intensive', shortName: 'WDI' },
    sites: [],
    slotCount: 14,
    commentProgress: progress,
    courseProcessId: null,
    courseProcess: null,
    slots: [slot(students)],
  };
}

function summary(progress: ClassDetail['commentProgress'] = pending): ClassSummary {
  const source = detail([], progress);
  return {
    id: source.id,
    name: source.name,
    status: source.status,
    startDate: source.startDate,
    endDate: source.endDate,
    recentlyEnded: source.recentlyEnded,
    course: source.course,
    sites: source.sites,
    slotCount: source.slotCount,
    commentProgress: progress,
  };
}

function envelope<T>(data: T) {
  return { success: true as const, data, requestId: 'class-cache-test' };
}

function seed(current: ClassDetail, listProgress: ClassDetail['commentProgress'] = pending) {
  appQueryClient().setQueryData(classDetailQuery(current.id).queryKey, envelope({ class: current }));
  appQueryClient().setQueryData(commentsClassesQuery().queryKey, envelope({ classes: [summary(listProgress)] }));
}

function cachedDetail(): ClassDetail {
  return appQueryClient().getQueryData<{ data: { class: ClassDetail } }>(classDetailQuery('class-1').queryKey)!.data.class;
}

function cachedListProgress() {
  return appQueryClient().getQueryData<{ data: { classes: ClassSummary[] } }>(commentsClassesQuery().queryKey)!.data.classes[0].commentProgress;
}

beforeEach(() => {
  appQueryClient().clear();
});

describe('class list progress cache', () => {
  it('patches the class list immediately after a successful submit even when LMS detail is still pending', () => {
    const students = Array.from({ length: 8 }, (_, index) => student(index + 1));
    seed(detail(students));

    const next = applyOptimisticClassSubmissions({
      classId: 'class-1',
      slotId: 'slot-10',
      studentIds: students.map((item) => item.studentId),
    });

    expect(next?.commentProgress).toMatchObject(done);
    expect(cachedDetail().commentProgress).toMatchObject(done);
    expect(cachedListProgress()).toMatchObject(done);
  });

  it('keeps the class list done when a stale LMS refetch still reports 8/8 chưa nhận xét', () => {
    const submitted = Array.from({ length: 8 }, (_, index) => student(index + 1, [area()]));
    const stale = Array.from({ length: 8 }, (_, index) => student(index + 1));
    seed(detail(stale, pending), pending);

    syncClassProgressFromDetail(detail(submitted, done));
    expect(cachedListProgress()).toMatchObject(done);

    appQueryClient().setQueryData(classDetailQuery('class-1').queryKey, envelope({ class: detail(stale, pending) }));
    reconcileClassSubmissionsAfterRefetch({
      classId: 'class-1',
      slotId: 'slot-10',
      studentIds: stale.map((item) => item.studentId),
    });

    expect(cachedDetail().commentProgress).toMatchObject(done);
    expect(cachedListProgress()).toMatchObject(done);
  });

  it('overlays the submitted comment text when LMS refetch still returns the previous CONTENT', () => {
    const stale = [student(1, [area('CONTENT', 'Nhận xét buổi trước')])];
    seed(detail(stale, done), done);
    reconcileClassSubmissionsAfterRefetch({
      classId: 'class-1',
      slotId: 'slot-10',
      studentIds: ['student-1'],
      comments: { 'student-1': 'Trong buổi học hôm nay, con hoàn thành tốt.' },
    });
    expect(cachedDetail().slots[0].studentAttendance[0].commentByAreas.find((item) => item.type === 'CONTENT')?.content).toBe(
      'Trong buổi học hôm nay, con hoàn thành tốt.',
    );
  });
});
