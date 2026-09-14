import type { ClassSummary, HomeworkLesson } from '@tool-lms/contracts';
import { Filter, RefreshCw } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { groupedClasses } from './selectors';
import { useHomeworkStore } from './store';

export function HomeworkFilters({ classes, lessons, refreshing, onRefresh }: { classes: ClassSummary[]; lessons: HomeworkLesson[]; refreshing: boolean; onRefresh: () => void }) {
  const classId = useHomeworkStore((state) => state.classId);
  const lessonId = useHomeworkStore((state) => state.lessonId);
  const status = useHomeworkStore((state) => state.status);
  const setClassId = useHomeworkStore((state) => state.setClassId);
  const setLessonId = useHomeworkStore((state) => state.setLessonId);
  const setStatus = useHomeworkStore((state) => state.setStatus);
  const grouped = groupedClasses(classes);
  return <Card className="homework-filters"><header className="card-header"><h2><Filter size={20} />Bộ lọc</h2><div className="filters">
    <select aria-label="Lớp" className="form-select" value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">-- Chọn lớp --</option>{grouped.active.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}{grouped.ended.length > 0 && <optgroup label="── Đã kết thúc gần đây ──">{grouped.ended.map((item) => <option key={item.id} value={item.id}>{item.name} (Kết thúc{item.endDate ? `: ${new Date(item.endDate).toLocaleDateString('vi-VN')}` : ''})</option>)}</optgroup>}</select>
    <select aria-label="Bài học" className="form-select" value={lessonId} onChange={(event) => setLessonId(event.target.value)} disabled={!classId}><option value="">Tất cả bài học</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.name}</option>)}</select>
    <select aria-label="Trạng thái" className="form-select" value={status} onChange={(event) => setStatus(event.target.value as '' | 'SUBMITTED' | 'MARKED')}><option value="SUBMITTED">Chờ chấm</option><option value="MARKED">Đã chấm</option><option value="">Tất cả</option></select>
    <button className="btn btn-outline btn-sm" disabled={refreshing} onClick={onRefresh}><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />{refreshing ? 'Đang tải...' : 'Làm mới'}</button>
  </div></header></Card>;
}
