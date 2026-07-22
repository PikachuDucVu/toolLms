import { escapeAttr, escapeHtml } from '../shared/dom.js';
import { showToast } from '../shared/toast.js';
import { tableSkeleton } from '../shared/skeleton.js';
import { state } from './state.js';
import { goToLogin } from './session.js';

export function updateSubmissionLocally(id, score, status = 'MARKED') {
            const sub = state.allSubmissions.find(s => s.id === id);
            if (sub) { sub.status = status; sub.score = score; }
            filterSubmissions();
            updateStats();
        }

export async function loadHomework() {
            const classId = document.getElementById('classSelect').value;
            if (!classId) {
                showToast('Vui lòng chọn lớp', 'error');
                return;
            }

            const loading = document.getElementById('loading');
            loading.innerHTML = tableSkeleton(6);
            loading.classList.add('show', 'skeleton-loading');
            document.getElementById('submissionsBody').innerHTML = '';

            try {
                const resp = await fetch(`/api/homework/${classId}`);
                if (resp.status === 401) {
                    goToLogin();
                    return;
                }
                if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
                const data = await resp.json();

                if (data.error) {
                    showToast(data.error, 'error');
                    return;
                }

                // Store data
                state.students = {};
                data.students.forEach(s => { state.students[s.studentUid] = s; });

                state.lessons = {};
                data.lessons.forEach(l => { state.lessons[l.id] = l; });

                // Filter only UPLOAD_FILE submissions
                state.allSubmissions = data.submissions.filter(s => s.type === 'UPLOAD_FILE');

                // Populate lesson filter
                const lessonSelect = document.getElementById('lessonFilter');
                lessonSelect.innerHTML = '<option value="">Tất cả bài học</option>';
                data.lessons.forEach(l => {
                    const opt = document.createElement('option');
                    opt.value = l.id;
                    opt.textContent = l.name;
                    lessonSelect.appendChild(opt);
                });

                filterSubmissions();
                updateStats();

            } catch (e) {
                showToast('Lỗi tải bài tập: ' + e.message, 'error');
            } finally {
                loading.classList.remove('show', 'skeleton-loading');
                loading.innerHTML = '';
            }
        }

export function syncEditsToState() {
            for (const sub of state.allSubmissions) {
                const scoreInput = document.getElementById(`score-${sub.id}`);
                const noteInput = document.getElementById(`note-${sub.id}`);
                if (scoreInput) {
                    const val = parseInt(scoreInput.value);
                    if (!isNaN(val)) sub.score = val;
                }
                if (noteInput) sub.note = noteInput.value;
            }
        }

export function keepMarkedVisible() {
            const statusFilter = document.getElementById('statusFilter');
            if (statusFilter && statusFilter.value === 'SUBMITTED') {
                statusFilter.value = '';
            }
        }

export function filterSubmissions() {
            syncEditsToState();
            const lessonId = document.getElementById('lessonFilter').value;
            const status = document.getElementById('statusFilter').value;

            state.filteredSubmissions = state.allSubmissions.filter(s => {
                if (lessonId && s.lessonId !== lessonId) return false;
                if (status && s.status !== status) return false;
                return true;
            });

            renderSubmissions();
            state.selectedIds.clear();
            updateSelectedCount();
        }

export function renderSubmissions() {
            const tbody = document.getElementById('submissionsBody');
            document.getElementById('submissionCount').textContent = state.filteredSubmissions.length;

            if (state.filteredSubmissions.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8">
                            <div class="empty-state">
                                <svg class="empty-state-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                                <div class="empty-state-text">Không tìm thấy bài nộp</div>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = state.filteredSubmissions.map(sub => {
                const student = state.students[sub.studentUid] || {};
                const lesson = state.lessons[sub.lessonId] || {};
                const attachments = sub.content?.attachments || [];
                const isMarked = sub.status === 'MARKED';
                const statusClass = isMarked ? 'badge-success' : 'badge-warning';
                const statusText = isMarked ? 'Đã chấm' : 'Chờ chấm';

                const filesHtml = attachments.map(att => {
                    const filename = att.split('/').pop();
                    const shortName = filename.length > 25 ? filename.substring(0, 22) + '...' : filename;
                    return `<a href="#" class="file-link" onclick="downloadFile('${escapeAttr(att)}'); return false;" title="${escapeAttr(filename)}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        ${escapeHtml(shortName)}
                    </a>`;
                }).join('<br>');

                return `
                    <tr data-id="${sub.id}">
                        <td class="checkbox-cell">
                            <input type="checkbox" class="select-checkbox row-checkbox"
                                   value="${sub.id}" onchange="toggleSelect('${sub.id}')">
                        </td>
                        <td class="student-name">${escapeHtml(student.displayName || 'Unknown')}</td>
                        <td class="lesson-name">${escapeHtml(lesson.name || 'Unknown')}</td>
                        <td>${filesHtml || '<span style="color: var(--gray-400);">Không có tệp</span>'}</td>
                        <td><span class="badge ${statusClass}">${statusText}</span></td>
                        <td>
                            <input type="number" class="score-input" id="score-${sub.id}" value="${isMarked ? sub.score : 100}" min="0" max="100">
                        </td>
                        <td>
                            <textarea class="note-input" id="note-${sub.id}" placeholder="Nhận xét (AI sẽ tự điền)...">${escapeHtml(sub.note || '')}</textarea>
                        </td>
                        <td>
                            <div style="display: flex; gap: 6px;">
                                <button class="btn btn-success btn-sm" onclick="markSingle('${sub.id}')">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                                    Gửi
                                </button>
                                <button class="btn btn-primary btn-sm" id="ai-btn-${sub.id}" onclick="aiGradeSingle('${sub.id}')">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                                    AI
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

export function updateStats() {
            let pending = 0, marked = 0;
            for (const s of state.allSubmissions) {
                if (s.status === 'SUBMITTED') pending++;
                else if (s.status === 'MARKED') marked++;
            }
            const total = state.allSubmissions.length;

            document.getElementById('statTotal').textContent = total;
            document.getElementById('statPending').textContent = pending;
            document.getElementById('statMarked').textContent = marked;
            document.getElementById('statsBar').style.display = total > 0 ? 'flex' : 'none';
        }

export async function downloadFile(fileKey) {
            try {
                const resp = await fetch(`/api/homework/download-url?key=${encodeURIComponent(fileKey)}`);
                const data = await resp.json();
                if (data.url) {
                    window.open(data.url, '_blank');
                } else {
                    showToast('Không thể lấy đường dẫn tải', 'error');
                }
            } catch (e) {
                showToast('Lỗi: ' + e.message, 'error');
            }
        }

export function toggleSelect(id) {
            if (state.selectedIds.has(id)) {
                state.selectedIds.delete(id);
            } else {
                state.selectedIds.add(id);
            }
            updateSelectedCount();
        }

export function toggleSelectAll() {
            const checked = document.getElementById('selectAll').checked;
            const checkboxes = document.querySelectorAll('.row-checkbox:not(:disabled)');

            state.selectedIds.clear();
            checkboxes.forEach(cb => {
                cb.checked = checked;
                if (checked) {
                    state.selectedIds.add(cb.value);
                }
            });
            updateSelectedCount();
        }

export function updateSelectedCount() {
            const btn = document.getElementById('markSelectedBtn');
            const aiBtn = document.getElementById('aiGradeSelectedBtn');
            const countSpan = document.getElementById('selectedCount');
            const aiCountSpan = document.getElementById('aiSelectedCount');
            btn.disabled = state.selectedIds.size === 0;
            aiBtn.disabled = state.selectedIds.size === 0;
            countSpan.textContent = state.selectedIds.size;
            aiCountSpan.textContent = state.selectedIds.size;
        }
