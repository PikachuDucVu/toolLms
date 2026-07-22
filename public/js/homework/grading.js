import { showToast } from '../shared/toast.js';
import { state } from './state.js';
import { apiCall } from './api.js';
import { getHomeworkSelectedModel } from './config.js';
import { goToLogin } from './session.js';
import { filterSubmissions, keepMarkedVisible, syncEditsToState, updateSelectedCount, updateSubmissionLocally, updateStats } from './submissions.js';

export async function markSingle(id) {
            const scoreInput = document.getElementById(`score-${id}`);
            const score = parseInt(scoreInput?.value);
            if (isNaN(score) || score < 0 || score > 100) {
                showToast('Điểm phải từ 0 đến 100', 'error');
                return;
            }
            const note = document.getElementById(`note-${id}`)?.value?.trim() || '';

            try {
                const data = await apiCall('/api/homework/mark', { id, score, note });
                if (data.success) {
                    showToast(`Đã chấm ${score} điểm!`);
                    const sub = state.allSubmissions.find(s => s.id === id);
                    if (sub) sub.note = note;
                    keepMarkedVisible();
                    updateSubmissionLocally(id, score);
                } else {
                    showToast(data.error || 'Lỗi chấm điểm', 'error');
                }
            } catch (e) {
                showToast('Lỗi: ' + e.message, 'error');
            }
        }

export async function markSelected() {
            if (state.selectedIds.size === 0) {
                showToast('Chưa chọn bài nào', 'error');
                return;
            }

            const score = parseInt(document.getElementById('batchScore').value);
            if (isNaN(score) || score < 0 || score > 100) {
                showToast('Điểm phải từ 0 đến 100', 'error');
                return;
            }
            if (!(await confirmDialog({
                title: 'Chấm bài đã chọn',
                message: `Chấm ${state.selectedIds.size} bài đã chọn với ${score} điểm?`,
                confirmText: `Chấm ${state.selectedIds.size} bài`,
                tone: 'warning'
            }))) return;
            syncEditsToState();
            // Send each row's edited note along with the batch score
            const submissions = Array.from(state.selectedIds).map(id => {
                const sub = state.allSubmissions.find(s => s.id === id);
                return { id, score, note: sub?.note || '' };
            });

            const btn = document.getElementById('markSelectedBtn');
            btn.disabled = true;
            try {
                const data = await apiCall('/api/homework/batch-mark', { submissions });
                if (data.success) {
                    showToast(`Đã chấm ${data.success_count}/${data.total} bài!`);

                    // Update local data
                    data.results.forEach(r => {
                        if (r.success) {
                            const sub = state.allSubmissions.find(s => s.id === r.id);
                            if (sub) {
                                sub.status = 'MARKED';
                                sub.score = score;
                            }
                        }
                    });

                    state.selectedIds.clear();
                    keepMarkedVisible();
                    filterSubmissions();
                    updateStats();
                } else {
                    showToast(data.error || 'Lỗi chấm điểm', 'error');
                }
            } catch (e) {
                showToast('Lỗi: ' + e.message, 'error');
            } finally {
                btn.disabled = state.selectedIds.size === 0;
            }
        }

export async function markAllPending() {
            const pending = state.allSubmissions.filter(s => s.status === 'SUBMITTED');
            if (pending.length === 0) {
                showToast('Không có bài chờ chấm', 'error');
                return;
            }

            if (!(await confirmDialog({
                title: 'Chấm hàng loạt',
                message: `Bạn có chắc muốn chấm ${pending.length} bài với 100 điểm?`,
                confirmText: `Chấm ${pending.length} bài`,
                tone: 'warning'
            }))) {
                return;
            }

            const submissions = pending.map(s => ({ id: s.id, score: 100 }));

            try {
                const data = await apiCall('/api/homework/batch-mark', { submissions });
                if (data.success) {
                    showToast(`Đã chấm ${data.success_count}/${data.total} bài!`);
                    loadHomework(); // Reload all
                } else {
                    showToast(data.error || 'Lỗi chấm điểm', 'error');
                }
            } catch (e) {
                showToast('Lỗi: ' + e.message, 'error');
            }
        }

export async function aiGradeSingle(id) {
            const sub = state.allSubmissions.find(s => s.id === id);
            if (!sub) {
                showToast('Không tìm thấy bài nộp', 'error');
                return;
            }

            const student = state.students[sub.studentUid] || {};
            const lesson = state.lessons[sub.lessonId] || {};
            const attachments = sub.content?.attachments || [];
            const { aiModel, customModelId, thinkingLevel, aiApiKey } = getHomeworkSelectedModel();

            const btn = document.getElementById(`ai-btn-${id}`);
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;margin:0;"></div>';

            try {
                // AI analyze — fill score + note into the row for teacher to review, do NOT auto-submit
                const aiResp = await fetch('/api/homework/ai-grade', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        attachments,
                        lesson_name: lesson.name || '',
                        student_name: student.displayName || '',
                        model_id: aiModel,
                        custom_model_id: customModelId,
                        thinking_level: thinkingLevel,
                        api_key: aiApiKey
                    })
                });
                const aiData = await aiResp.json();

                if (!aiData.success) {
                    showToast(aiData.error || 'AI lỗi', 'error');
                    return;
                }

                sub.score = aiData.score;
                sub.note = aiData.note || '';
                const scoreInput = document.getElementById(`score-${id}`);
                const noteInput = document.getElementById(`note-${id}`);
                if (scoreInput) scoreInput.value = aiData.score;
                if (noteInput) noteInput.value = aiData.note || '';
                showToast(`AI đề xuất ${aiData.score} điểm. Kiểm tra rồi bấm "Gửi".`, 'info');
            } catch (e) {
                showToast('Lỗi: ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }

export async function createBatchGradeJob(pending, button = null) {
            const classId = document.getElementById('classSelect').value;
            const { aiModel, customModelId, thinkingLevel, aiApiKey } = getHomeworkSelectedModel();
            if (button) button.disabled = true;
            try {
                const resp = await fetch('/api/homework/batch-grade', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        class_id: classId,
                        submissions: pending,
                        students: state.students,
                        lessons: state.lessons,
                        model_id: aiModel,
                        custom_model_id: customModelId,
                        thinking_level: thinkingLevel,
                        api_key: aiApiKey
                    })
                });
                const data = await resp.json().catch(() => ({}));
                if (resp.status === 401) {
                    goToLogin();
                    return;
                }
                if (!data.success) {
                    showToast(data.error || 'Không tạo được job AI', 'error');
                    return;
                }
                showToast(`Đã tạo job AI cho ${pending.length} bài. Đang xử lý...`, 'info');
                await pollBatchGradeJob(data.jobId, pending.length);
            } catch (e) {
                showToast('Lỗi tạo job AI: ' + e.message, 'error');
            } finally {
                if (button) button.disabled = false;
            }
        }

export async function pollBatchGradeJob(jobId, total) {
            for (;;) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                const resp = await fetch(`/api/homework/jobs/${jobId}`);
                const data = await resp.json();
                if (!data.success) {
                    showToast(data.error || 'Không lấy được trạng thái job', 'error');
                    return;
                }
                const job = data.job || {};
                const done = (job.completed_items || 0) + (job.failed_items || 0);
                showToast(`AI đang chấm: ${done}/${total} bài`, 'info');
                if (['completed', 'cancelled'].includes(job.status)) {
                    showToast(`AI hoàn tất: ${job.completed_items || 0}/${total} thành công, ${job.failed_items || 0} lỗi`);
                    await loadHomework();
                    return;
                }
            }
        }

export async function aiGradeSelected() {
            if (state.selectedIds.size === 0) {
                showToast('Chưa chọn bài nào', 'error');
                return;
            }
            const pending = Array.from(state.selectedIds).map(id => state.allSubmissions.find(s => s.id === id)).filter(Boolean);
            if (!(await confirmDialog({
                title: 'AI chấm bài đã chọn',
                message: `AI sẽ chấm ${pending.length} bài đã chọn. Tiếp tục?`,
                confirmText: 'AI chấm',
                tone: 'info'
            }))) return;
            await createBatchGradeJob(pending, document.getElementById('aiGradeSelectedBtn'));
            state.selectedIds.clear();
            updateSelectedCount();
        }

export async function aiGradeAllPending() {
            const pending = state.allSubmissions.filter(s => s.status === 'SUBMITTED');
            if (pending.length === 0) {
                showToast('Không có bài chờ chấm', 'error');
                return;
            }
            if (!(await confirmDialog({
                title: 'AI chấm tất cả bài chờ',
                message: `AI sẽ chấm ${pending.length} bài chờ. Tiếp tục?`,
                confirmText: 'AI chấm tất cả',
                tone: 'info'
            }))) return;
            await createBatchGradeJob(pending);
        }
