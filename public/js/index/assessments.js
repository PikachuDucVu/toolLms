import { app } from './registry.js';
import { state } from './state.js';

function getRegularStudentDomId(studentId) {
            return `student_${Array.from(String(studentId || '')).map(char => char.codePointAt(0).toString(16)).join('_')}`;
        }

function stripHtmlText(value) {
            const container = document.createElement('div');
            container.innerHTML = String(value || '');
            return (container.textContent || container.innerText || '').replace(/\s+/g, ' ').trim();
        }

function getStudentCallName(fullName, roster = state.students) {
            const normalizedFullName = String(fullName || '').normalize('NFC').trim().replace(/\s+/g, ' ');
            const nameParts = normalizedFullName.split(' ').filter(Boolean);
            if (nameParts.length === 0) return 'em';

            const finalName = nameParts.at(-1);
            const normalizedFinalName = finalName.toLocaleLowerCase('vi-VN');
            const matchingFinalNameCount = (Array.isArray(roster) ? roster : []).reduce((count, entry) => {
                const rosterFullName = String(entry?.student?.fullName ?? entry?.fullName ?? '')
                    .normalize('NFC')
                    .trim()
                    .replace(/\s+/g, ' ');
                const rosterFinalName = rosterFullName.split(' ').filter(Boolean).at(-1);
                return rosterFinalName?.toLocaleLowerCase('vi-VN') === normalizedFinalName ? count + 1 : count;
            }, 0);

            return matchingFinalNameCount > 1 && nameParts.length > 1
                ? nameParts.slice(-2).join(' ')
                : finalName;
        }

function normalizeLearningLevel(value) {
            return Object.prototype.hasOwnProperty.call(app.LEARNING_LEVELS, value)
                ? value
                : app.DEFAULT_LEARNING_LEVEL;
        }

function getRegularLearningLevel(studentId) {
            return app.normalizeLearningLevel(state.regularLearningLevelDrafts[studentId]);
        }

function getCurrentLevelCatalog() {
            return app.isProductProgressSession?.() ? app.PRODUCT_PROGRESS_LEVELS : app.LEARNING_LEVELS;
        }

function getCurrentLevelInfo(learningLevel) {
            return app.getCurrentLevelCatalog()[app.normalizeLearningLevel(learningLevel)];
        }

function getRegularNoteValue(studentId) {
            return Object.prototype.hasOwnProperty.call(state.regularNoteDrafts, studentId)
                ? state.regularNoteDrafts[studentId]
                : '';
        }

function captureRegularContext() {
            if (!state.classData?.id || !state.selectedSlot?._id) return null;
            return {
                classId: state.classData.id,
                className: state.classData.name || '',
                slotId: state.selectedSlot._id,
                sessionNumber: app.getCurrentSessionNumber(),
                classSiteId: state.classData.classSites?.[0]?._id || '',
                courseProcessId: state.classData.courseProcessId,
                assessmentEpoch: state.regularAssessmentContextEpoch,
                summary: document.getElementById('sessionSummary')?.value || ''
            };
        }

function isRegularContextCurrent(context) {
            return !!context
                && state.classData?.id === context.classId
                && state.selectedSlot?._id === context.slotId
                && state.regularAssessmentContextEpoch === context.assessmentEpoch;
        }

function getRegularAssessmentDraft(studentId) {
            return {
                learningLevel: app.getRegularLearningLevel(studentId),
                note: String(app.getRegularNoteValue(studentId) ?? '').trim()
            };
        }

function getRegularAssessmentStatus(studentId) {
            if (state.regularAssessmentLoad.loading && state.regularAssessmentLoad.slotId === state.selectedSlot?._id) {
                return { text: 'Đang tải đánh giá', className: '', loading: true, error: false };
            }
            if (state.regularAssessmentLoad.error && state.regularAssessmentLoad.slotId === state.selectedSlot?._id) {
                return { text: 'Không tải được đánh giá', className: 'is-error', loading: false, error: true };
            }
            if (state.regularAssessmentAutoSaveBusy.has(studentId)) {
                return { text: 'Đang lưu mức...', className: '', loading: false, error: false };
            }
            if (state.regularAssessmentAutoSaveErrors[studentId]) {
                return { text: 'Lưu mức thất bại', className: 'is-error', loading: false, error: false, saveError: true };
            }

            const draft = app.getRegularAssessmentDraft(studentId);
            const synced = state.regularServerSyncedAssessments[studentId];
            if (!synced) {
                const inherited = state.regularInheritedAssessments[studentId];
                const touched = state.regularAssessmentTouched.has(studentId);
                return {
                    text: touched
                        ? 'Chưa lưu'
                        : inherited
                            ? `Kế thừa ${app.getCurrentLevelInfo(inherited.learningLevel).code} từ buổi trước`
                            : 'Mặc định L3 · chưa lưu buổi này',
                    className: touched ? 'is-dirty' : '',
                    loading: false,
                    error: false
                };
            }
            const levelSaved = synced.learningLevel === draft.learningLevel;
            const noteSaved = synced.note === draft.note;
            const isSaved = levelSaved && noteSaved;
            return {
                text: isSaved ? 'Đã lưu' : levelSaved ? 'Chưa lưu ghi chú' : 'Chưa lưu',
                className: isSaved ? 'is-saved' : 'is-dirty',
                loading: false,
                error: false
            };
        }

function snapshotRegularStudent(att) {
            const assessment = app.getRegularAssessmentDraft(att.student.id);
            const attendanceStatus = att.status === 'ATTENDED' || att.status === 'LATE_ARRIVED' || att.status === 'ABSENT_WITH_NOTICE'
                ? att.status
                : 'ABSENT';
            return {
                attendanceId: att._id,
                studentId: att.student.id,
                studentName: att.student.fullName || '',
                studentCallName: app.getStudentCallName(att.student.fullName, state.students),
                attendanceStatus,
                isLate: att.status === 'LATE_ARRIVED',
                assessment,
                pastSlots: app.getPastComments(att.student.id)
            };
        }

async function runWithConcurrency(items, limit, worker) {
            let cursor = 0;
            const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
                while (cursor < items.length) {
                    const index = cursor++;
                    await worker(items[index], index);
                }
            });
            await Promise.all(runners);
        }

async function ensureRegularAssessmentsLoaded(context) {
            const load = state.regularAssessmentLoad;
            if (!context || load.slotId !== context.slotId) {
                throw new Error('Dữ liệu đánh giá không thuộc buổi học hiện tại');
            }
            await load.promise;
            if (!app.isRegularContextCurrent(context) || state.regularAssessmentLoad.slotId !== context.slotId) {
                throw new Error('Đã chuyển sang lớp hoặc buổi học khác');
            }
            if (state.regularAssessmentLoad.error) throw state.regularAssessmentLoad.error;
        }

function getPreviousRegularSlotIds(slotId) {
            const slots = Array.isArray(state.classData?.slots) ? state.classData.slots : [];
            const currentSlot = slots.find(slot => slot?._id === slotId);
            const currentSlotIndex = Number(currentSlot?.index);
            if (!Number.isFinite(currentSlotIndex)) return [];

            return slots
                .filter(slot => slot?._id && Number.isFinite(Number(slot.index)) && Number(slot.index) < currentSlotIndex)
                .sort((left, right) => Number(right.index) - Number(left.index))
                .slice(0, 100)
                .map(slot => slot._id);
        }

function loadRegularAssessments(slotId) {
            const token = state.regularAssessmentLoad.token + 1;
            const loadState = {
                slotId,
                token,
                loading: true,
                error: null,
                promise: null
            };
            state.regularAssessmentLoad = loadState;

            loadState.promise = (async () => {
                try {
                    const params = new URLSearchParams();
                    if (state.classData?.id) params.set('class_id', state.classData.id);
                    getPreviousRegularSlotIds(slotId).forEach(previousSlotId => params.append('previous_slot_id', previousSlotId));
                    const query = params.toString();
                    const response = await fetch(`/api/assessments/${encodeURIComponent(slotId)}${query ? `?${query}` : ''}`);
                    if (!response.ok) {
                        const data = await response.json().catch(() => ({}));
                        throw new Error(data.error || `Không thể tải đánh giá (${response.status})`);
                    }
                    const data = await response.json();
                    if (state.regularAssessmentLoad.token !== token || state.selectedSlot?._id !== slotId) return;

                    Object.entries(data.assessments || {}).forEach(([studentId, assessment]) => {
                        const normalized = {
                            learningLevel: app.normalizeLearningLevel(assessment?.learningLevel),
                            note: assessment?.inherited ? '' : String(assessment?.note ?? '').trim()
                        };
                        if (assessment?.inherited) {
                            state.regularInheritedAssessments[studentId] = {
                                learningLevel: normalized.learningLevel,
                                sourceSlotId: String(assessment?.sourceSlotId || assessment?.slotId || '')
                            };
                        } else {
                            state.regularServerSyncedAssessments[studentId] = normalized;
                            delete state.regularInheritedAssessments[studentId];
                        }
                        if (!Object.prototype.hasOwnProperty.call(state.regularLearningLevelDrafts, studentId)) {
                            state.regularLearningLevelDrafts[studentId] = normalized.learningLevel;
                        }
                        if (!Object.prototype.hasOwnProperty.call(state.regularNoteDrafts, studentId)) {
                            state.regularNoteDrafts[studentId] = normalized.note;
                        }
                    });
                } catch (error) {
                    if (state.regularAssessmentLoad.token !== token || state.selectedSlot?._id !== slotId) return;
                    loadState.error = error instanceof Error ? error : new Error(String(error));
                    console.warn('Không thể tải đánh giá buổi học:', error);
                    app.showToast('Không thể tải đánh giá đã lưu; chưa thể tạo hoặc gửi nhận xét', 'error');
                } finally {
                    if (state.regularAssessmentLoad.token !== token || state.selectedSlot?._id !== slotId) return;
                    loadState.loading = false;
                    app.renderStudents();
                    app.updateStats();
                }
            })();

            return loadState.promise;
        }

function retryRegularAssessments() {
            if (!state.selectedSlot?._id || app.isRegularOperationActive()) return;
            state.regularNoteDrafts = {};
            state.regularLearningLevelDrafts = {};
            state.regularServerSyncedAssessments = {};
            state.regularInheritedAssessments = {};
            state.regularAssessmentTouched.clear();
            state.regularAssessmentAutoSaveBusy.clear();
            state.regularAssessmentAutoSaveErrors = {};
            state.regularAssessmentContextEpoch += 1;
            app.loadRegularAssessments(state.selectedSlot._id);
            app.renderStudents();
            app.updateStats();
        }

function getAttendancePresentation(att) {
            if (att.status === 'ATTENDED') return { text: 'Có mặt', badgeClass: 'badge-success' };
            if (att.status === 'LATE_ARRIVED') return { text: 'Đi muộn', badgeClass: 'badge-warning' };
            if (att.status === 'ABSENT_WITH_NOTICE') return { text: 'Vắng có phép', badgeClass: 'badge-gray' };
            return { text: 'Vắng', badgeClass: 'badge-gray' };
        }

function getRegularStudentUiState(att) {
            const studentId = att.student.id;
            const fullName = att.student.fullName || '';
            const initials = fullName.split(' ').filter(Boolean).slice(-2).map(part => part[0]).join('').toUpperCase();
            const attendance = app.getAttendancePresentation(att);
            const existingComment = att.commentByAreas?.find(area => area.type === 'CONTENT')?.content || '';
            const generatedComment = state.generatedComments[studentId] || '';
            const note = app.getRegularNoteValue(studentId);
            const learningLevel = app.getRegularLearningLevel(studentId);
            const learningLevelInfo = app.getCurrentLevelInfo(learningLevel);
            const assessmentStatus = app.getRegularAssessmentStatus(studentId);
            const progressState = app.getStudentProgressState(att, 'regular');
            const progress = progressState === 'draft'
                ? { text: 'Bản nháp AI', badgeClass: 'badge-generated' }
                : progressState === 'submitted'
                    ? { text: 'Đã gửi LMS', badgeClass: 'badge-success' }
                    : { text: 'Chưa xử lý', badgeClass: 'badge-warning' };

            return {
                studentId,
                fullName,
                initials,
                attendance,
                existingComment,
                generatedComment,
                note,
                learningLevel,
                learningLevelInfo,
                assessmentStatus,
                progress,
                progressState,
                isPresent: app.isPresentAttendance(att),
                hasRateScore: !!att.commentByAreas?.some(area => area.type === 'RATE')
            };
        }

function getRegularStudentPreview(att) {
            const studentState = app.getRegularStudentUiState(att);
            const preview = [studentState.note, studentState.generatedComment, studentState.existingComment]
                .map(app.stripHtmlText)
                .find(Boolean);
            if (studentState.assessmentStatus.loading) return studentState.isPresent ? 'Đang tải mức độ nắm bài và ghi chú đã lưu...' : 'Đang tải ghi chú đã lưu...';
            if (studentState.assessmentStatus.error) return 'Không tải được đánh giá — vui lòng thử lại';
            if (!studentState.isPresent) return preview || 'Chưa có nhận xét chuyên cần';
            return preview || studentState.learningLevelInfo.help;
        }

function buildRegularStudentListItem(att, inlineDetail = '') {
            const studentState = app.getRegularStudentUiState(att);
            const domId = app.getRegularStudentDomId(studentState.studentId);
            const studentIdAttr = app.escapeAttr(studentState.studentId);
            const studentIdJs = app.escapeInlineJsAttr(studentState.studentId);
            const isSelected = studentState.studentId === state.selectedRegularStudentId;
            const preview = app.getRegularStudentPreview(att);
            const previewIsEmpty = preview === 'Chưa có ghi chú hoặc nhận xét';

            return `
                <div class="student-list-entry" id="student-entry-${domId}" role="listitem" data-student-id="${studentIdAttr}">
                    <button type="button" class="student-list-item ${isSelected ? 'active' : ''}"
                        aria-pressed="${isSelected}" aria-controls="regularStudentDetail"
                        onclick="selectRegularStudent('${studentIdJs}')">
                        <span class="student-list-main">
                            <span class="student-avatar" aria-hidden="true">${app.escapeHtml(studentState.initials)}</span>
                            <span class="student-list-text">
                                <span class="student-list-name">${app.escapeHtml(studentState.fullName)}</span>
                                <span class="student-list-badges">
                                    <span class="badge ${studentState.attendance.badgeClass}">${studentState.attendance.text}</span>
                                    <span class="badge ${studentState.progress.badgeClass}">${studentState.progress.text}</span>
                                    ${studentState.isPresent ? `<span class="badge badge-learning-level ${(studentState.assessmentStatus.loading || studentState.assessmentStatus.error) ? 'is-loading' : ''}" id="student-level-badge-${domId}">${studentState.assessmentStatus.loading ? 'Đang tải đánh giá' : studentState.assessmentStatus.error ? 'Không tải được' : `${studentState.learningLevelInfo.code} · ${studentState.learningLevelInfo.shortLabel}`}</span>` : ''}
                                    ${studentState.hasRateScore ? '<span class="badge badge-gray badge-rate-score">Điểm NL</span>' : ''}
                                </span>
                                <span class="student-list-preview ${previewIsEmpty ? 'is-empty' : ''}" id="student-preview-${domId}">${app.escapeHtml(preview)}</span>
                            </span>
                        </span>
                        <svg class="student-list-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18 6-6-6-6"/>
                        </svg>
                    </button>
                    ${inlineDetail}
                </div>
            `;
        }

function buildRegularStudentDetail(att, idx) {
            const studentState = app.getRegularStudentUiState(att);
            const domId = app.getRegularStudentDomId(studentState.studentId);
            const studentIdJs = app.escapeInlineJsAttr(studentState.studentId);
            const studentNameJs = app.escapeInlineJsAttr(studentState.fullName);
            const studentNameAttr = app.escapeAttr(studentState.fullName);
            const attendanceIdJs = app.escapeInlineJsAttr(att._id);
            const cleanGeneratedComment = app.stripHtmlText(studentState.generatedComment);
            const hasAnyCopyableComment = !!(studentState.generatedComment || studentState.existingComment);
            const actionsDisabled = app.isRegularOperationActive() || studentState.assessmentStatus.loading || studentState.assessmentStatus.error;
            const isGenerating = state.regularStudentBusy.has(studentState.studentId);
            const generateLabel = isGenerating
                ? 'Đang tạo...'
                : studentState.isPresent
                    ? studentState.generatedComment ? 'Tạo lại nhận xét' : 'Tạo nhận xét AI'
                    : studentState.generatedComment ? 'Tạo lại nhận xét vắng' : 'Tạo nhận xét vắng';

            return `
                <div class="student-detail-header">
                    <div class="student-detail-title">
                        <div class="student-avatar" aria-hidden="true">${app.escapeHtml(studentState.initials)}</div>
                        <div>
                            <div class="student-name" id="regular-student-title-${domId}">${app.escapeHtml(studentState.fullName)}</div>
                            <div class="student-detail-meta">
                                <span class="badge ${studentState.attendance.badgeClass}">${studentState.attendance.text}</span>
                                <span class="badge ${studentState.progress.badgeClass}">${studentState.progress.text}</span>
                                ${studentState.isPresent ? `<span class="badge badge-learning-level ${(studentState.assessmentStatus.loading || studentState.assessmentStatus.error) ? 'is-loading' : ''}" id="regular-level-badge-${domId}">${studentState.assessmentStatus.loading ? 'Đang tải đánh giá' : studentState.assessmentStatus.error ? 'Không tải được' : `${studentState.learningLevelInfo.code} · ${studentState.learningLevelInfo.shortLabel}`}</span>` : ''}
                                ${studentState.hasRateScore ? '<span class="badge badge-gray">Đã có điểm năng lực</span>' : ''}
                            </div>
                        </div>
                    </div>
                </div>

                ${!studentState.isPresent ? `
                    <div class="regular-absent-note" role="note">
                        <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>
                        Học sinh vắng nên không nằm trong thao tác hàng loạt. Bạn vẫn có thể tạo nhận xét riêng khi cần.
                    </div>
                ` : ''}

                ${studentState.existingComment ? `
                    <div class="student-detail-section">
                        <details class="regular-existing-comment" ${studentState.generatedComment ? '' : 'open'}>
                            <summary>Nhận xét hiện tại trên LMS</summary>
                            <div class="regular-existing-comment-body">${app.escapeHtml(app.stripHtmlText(studentState.existingComment))}</div>
                        </details>
                    </div>
                ` : ''}

                <div class="student-detail-section">
                    <div class="student-detail-section-title">
                        <span>Đánh giá buổi học</span>
                        <button type="button" class="btn-link" onclick="showPastComments('${studentIdJs}', '${studentNameJs}')">Xem buổi trước</button>
                    </div>
                    <div class="regular-assessment-editor" aria-busy="${studentState.assessmentStatus.loading}">
                        ${studentState.isPresent ? `
                            <fieldset class="learning-level-fieldset" ${(studentState.assessmentStatus.loading || studentState.assessmentStatus.error || app.isRegularOperationActive()) ? 'disabled' : ''}>
                                <legend class="learning-level-legend">
                                    <span>${app.isProductProgressSession?.() ? 'Chọn mức độ tiến độ sản phẩm' : 'Chọn mức độ nắm bài'}</span>
                                    <small>${studentState.assessmentStatus.loading ? 'Đang tải đánh giá đã lưu...' : studentState.assessmentStatus.error ? 'Vui lòng thử tải lại' : app.isProductProgressSession?.() ? 'L3 là mặc định · chọn một mức để tự lưu' : 'L3 là mặc định · chọn một mức để tự lưu'}</small>
                                </legend>
                                <div class="learning-level-grid" role="group" aria-label="Chọn mức độ nắm bài cho ${studentNameAttr}">
                                    ${Object.entries(app.getCurrentLevelCatalog()).sort(([, left], [, right]) => left.code.localeCompare(right.code)).map(([value, info]) => {
                                        const isSelected = studentState.learningLevel === value;
                                        return `
                                        <button type="button"
                                            class="learning-level-option ${isSelected ? 'is-selected' : ''}"
                                            id="level-option-${domId}-${value}"
                                            data-learning-level-student="${domId}"
                                            data-level-value="${value}"
                                            aria-pressed="${isSelected}"
                                            aria-label="Chọn ${info.code}: ${info.label} cho ${studentNameAttr}"
                                            onclick="onRegularLearningLevelChange('${studentIdJs}', '${value}')">
                                            <span class="learning-level-code">${info.code}</span>
                                            <span class="learning-level-copy">
                                                <strong>${info.label}</strong>
                                                <small>${info.help}</small>
                                            </span>
                                        </button>
                                    `;}).join('')}
                                </div>
                            </fieldset>
                        ` : `
                            <div class="regular-absence-action-copy">Không đánh giá level cho học sinh vắng. Nhận xét sẽ chỉ nêu tình trạng chuyên cần và nhắc con xem lại bài.</div>
                        `}

                        <details class="regular-extra-details">
                            <summary>
                                <span>Thêm chi tiết</span>
                                <small>Ghi chú không bắt buộc</small>
                            </summary>
                            <div class="regular-note-editor">
                                <label class="regular-note-label" for="note-${domId}">
                                    <span>Ghi chú bổ sung</span>
                                    <small>AI sẽ ưu tiên dữ kiện này</small>
                                </label>
                                <textarea id="note-${domId}" rows="2" placeholder="Ví dụ: chưa hiểu một phần nhưng chủ động hỏi; thực hành chậm ở một số bước..."
                                    ${(studentState.assessmentStatus.loading || studentState.assessmentStatus.error || app.isRegularOperationActive()) ? 'disabled' : ''}
                                    oninput="onRegularNoteInput('${studentIdJs}', this.value)">${app.escapeHtml(studentState.note)}</textarea>
                                <div class="regular-note-toolbar">
                                    <div class="regular-note-toolbar-left">
                                        ${studentState.assessmentStatus.error ? `
                                            <button type="button" class="btn btn-sm btn-outline" onclick="retryRegularAssessments()">Thử tải lại</button>
                                        ` : studentState.assessmentStatus.loading ? '' : `
                                            <details class="quick-template-menu">
                                                <summary class="btn btn-sm btn-outline">Mẫu ghi chú nhanh</summary>
                                                <div class="quick-template-popover">
                                                    <button type="button" class="menu-action" onclick="applyTemplate('${studentIdJs}', 'good'); closeDetailsMenu(this)">Tự làm tốt</button>
                                                    <button type="button" class="menu-action" onclick="applyTemplate('${studentIdJs}', 'asks'); closeDetailsMenu(this)">Chủ động hỏi</button>
                                                    <button type="button" class="menu-action" onclick="applyTemplate('${studentIdJs}', 'needwork'); closeDetailsMenu(this)">Cần gợi ý</button>
                                                    <button type="button" class="menu-action" onclick="applyTemplate('${studentIdJs}', 'naughty'); closeDetailsMenu(this)">Hay mất tập trung</button>
                                                </div>
                                            </details>
                                        `}
                                    </div>
                                    <div class="regular-note-toolbar-right">
                                        <span class="assessment-save-status ${studentState.assessmentStatus.className}" id="assessment-status-${domId}" aria-live="polite">${studentState.assessmentStatus.text}</span>
                                        <button type="button" class="btn btn-sm btn-outline" id="save-note-${domId}" onclick="saveAssessment('${studentIdJs}')"
                                            ${(studentState.assessmentStatus.loading || studentState.assessmentStatus.error || app.isRegularOperationActive()) ? 'disabled' : ''} aria-busy="${state.regularAssessmentSaveBusy.has(studentState.studentId)}">
                                            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5 12.75 10.5 18l9-13.5"/></svg>
                                            Lưu đánh giá
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </details>
                    </div>
                </div>

                <div class="student-detail-section">
                    <div class="student-detail-section-title">
                        <span>Nhận xét gửi phụ huynh</span>
                        ${studentState.generatedComment ? '<span class="badge badge-generated">Bản nháp AI</span>' : ''}
                    </div>
                    ${studentState.generatedComment ? `
                        <label class="sr-only" for="comment-${domId}">Chỉnh sửa nhận xét của ${app.escapeHtml(studentState.fullName)}</label>
                        <textarea class="comment-edit" id="comment-${domId}" oninput="updateComment('${studentIdJs}', this.value)">${app.escapeHtml(cleanGeneratedComment)}</textarea>
                    ` : `
                        <div class="regular-ai-empty">
                            <img class="regular-ai-visual" src="/assets/empty-ai-comment.jpg" alt="Minh họa AI tạo nhận xét học sinh" width="640" height="480" loading="lazy" decoding="async">
                            <span>Chưa có bản nháp AI. Hệ thống sẽ dùng mức độ nắm bài và ghi chú bổ sung để tạo nhận xét cụ thể.</span>
                        </div>
                    `}
                </div>

                <div class="student-detail-actions">
                    <button type="button" class="btn btn-sm ${studentState.generatedComment ? 'btn-outline' : 'btn-primary'}" onclick="generateSingle('${studentIdJs}')" id="gen-btn-${domId}" ${actionsDisabled ? 'disabled' : ''} aria-busy="${isGenerating}">
                        <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.813 15.904 9 18l-.813-2.096a4.5 4.5 0 0 0-2.591-2.591L3.5 12.5l2.096-.813a4.5 4.5 0 0 0 2.591-2.591l2.096-.813-2.096-.813a4.5 4.5 0 0 0-2.591-2.591L9 7l-.813 2.096a4.5 4.5 0 0 1-2.591 2.591L3.5 12.5l2.096.813a4.5 4.5 0 0 1 2.591 2.591Z"/></svg>
                        ${generateLabel}
                    </button>
                    ${studentState.generatedComment ? `
                        <button type="button" class="btn btn-sm btn-success detail-primary" id="submit-btn-${domId}" onclick="submitSingle('${studentIdJs}', '${attendanceIdJs}')" ${actionsDisabled ? 'disabled' : ''}>
                            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-8-4-4m0 0L8 8m4-4v12"/></svg>
                            Gửi lên LMS
                        </button>
                    ` : ''}
                    ${hasAnyCopyableComment ? `
                        <details class="detail-overflow">
                            <summary class="btn btn-sm btn-outline" aria-label="Thêm thao tác với ${studentNameAttr}">
                                <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 6a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 6a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"/></svg>
                                Thêm
                            </summary>
                            <div class="detail-menu-popover">
                                <button type="button" class="menu-action" onclick="closeDetailsMenu(this); copyZaloComment('${studentNameJs}', '${studentIdJs}')">
                                    <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1M8 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M8 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/></svg>
                                    Sao chép cho Zalo
                                </button>
                                ${studentState.generatedComment ? `
                                    <button type="button" class="menu-action danger" onclick="closeDetailsMenu(this); deleteComment('${studentIdJs}')">
                                        <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0V4.477c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
                                        Xóa bản nháp AI
                                    </button>
                                ` : ''}
                            </div>
                        </details>
                    ` : ''}
                </div>
            `;
        }

function renderRegularStudents(toRender, list) {
            if (!toRender.some(att => att.student.id === state.selectedRegularStudentId)) {
                state.selectedRegularStudentId = toRender[0]?.student?.id || null;
            }

            const selectedAtt = toRender.find(att => att.student.id === state.selectedRegularStudentId);
            const selectedIdx = selectedAtt ? state.students.findIndex(att => att.student.id === selectedAtt.student.id) : -1;
            const isMobileLayout = window.matchMedia('(max-width: 900px)').matches;
            const detailMarkup = `
                <section class="student-detail-panel" id="regularStudentDetail"
                    aria-labelledby="regular-student-title-${app.getRegularStudentDomId(state.selectedRegularStudentId)}">
                    ${selectedAtt ? app.buildRegularStudentDetail(selectedAtt, selectedIdx) : '<div class="student-detail-empty">Chọn học sinh để xem chi tiết</div>'}
                </section>
            `;

            list.innerHTML = `
                <div class="student-workspace">
                    <div class="student-compact-list" role="list" aria-label="Học sinh phù hợp bộ lọc">
                        ${toRender.map(att => app.buildRegularStudentListItem(
                            att,
                            isMobileLayout && att.student.id === state.selectedRegularStudentId ? detailMarkup : ''
                        )).join('')}
                    </div>
                    ${isMobileLayout ? '' : detailMarkup}
                </div>
            `;

            requestAnimationFrame(() => {
                const compactList = list.querySelector('.student-compact-list');
                if (compactList) compactList.scrollTop = state.regularListScrollTop;
            });
        }

function selectRegularStudent(studentId) {
            const compactList = document.querySelector('#studentList .student-compact-list');
            if (compactList) state.regularListScrollTop = compactList.scrollTop;
            const selectedAtt = app.getVisibleStudents().find(att => att.student.id === studentId);
            if (!selectedAtt) return;

            state.selectedRegularStudentId = studentId;
            document.querySelectorAll('#studentList .student-list-item').forEach(button => {
                const isActive = button.parentElement?.dataset.studentId === studentId;
                button.classList.toggle('active', isActive);
                button.setAttribute('aria-pressed', String(isActive));
            });

            const detail = document.getElementById('regularStudentDetail');
            if (!detail) {
                app.renderStudents();
                return;
            }

            const selectedIdx = state.students.findIndex(att => att.student.id === studentId);
            detail.setAttribute('aria-labelledby', `regular-student-title-${app.getRegularStudentDomId(studentId)}`);
            detail.innerHTML = app.buildRegularStudentDetail(selectedAtt, selectedIdx);
            app.syncRegularDetailPlacement();
        }

function syncRegularDetailPlacement() {
            const workspace = document.querySelector('#studentList .student-workspace');
            const detail = document.getElementById('regularStudentDetail');
            if (!workspace || !detail || !state.selectedRegularStudentId) return;

            if (window.matchMedia('(max-width: 900px)').matches) {
                const selectedEntry = document.getElementById(`student-entry-${app.getRegularStudentDomId(state.selectedRegularStudentId)}`);
                if (selectedEntry && detail.parentElement !== selectedEntry) selectedEntry.appendChild(detail);
            } else if (detail.parentElement !== workspace) {
                workspace.appendChild(detail);
            }
        }

function refreshRegularAssessmentIndicators(studentId) {
            const domId = app.getRegularStudentDomId(studentId);
            const info = app.getCurrentLevelInfo(app.getRegularLearningLevel(studentId));
            const currentLevel = app.getRegularLearningLevel(studentId);
            const status = app.getRegularAssessmentStatus(studentId);
            [`student-level-badge-${domId}`, `regular-level-badge-${domId}`, `review-level-badge-${domId}`].forEach(id => {
                const badge = document.getElementById(id);
                if (!badge) return;
                badge.textContent = status.loading ? 'Đang tải đánh giá' : status.error ? 'Không tải được' : `${info.code} · ${info.shortLabel}`;
                badge.classList.toggle('is-loading', status.loading || status.error);
            });
            document.querySelectorAll(`[data-learning-level-student="${domId}"]`).forEach(button => {
                const isSelected = button.dataset.levelValue === currentLevel;
                button.classList.toggle('is-selected', isSelected);
                button.setAttribute('aria-pressed', String(isSelected));
            });

            const statusElement = document.getElementById(`assessment-status-${domId}`);
            if (statusElement) {
                statusElement.textContent = status.text;
                statusElement.className = `assessment-save-status ${status.className}`;
            }
            const reviewStatusElement = document.getElementById(`review-assessment-status-${domId}`);
            if (reviewStatusElement) reviewStatusElement.textContent = status.text;

            const att = state.students.find(item => item.student.id === studentId);
            const preview = document.getElementById(`student-preview-${domId}`);
            if (att && preview) {
                preview.textContent = app.getRegularStudentPreview(att);
                preview.classList.remove('is-empty');
            }
        }

function applyRegularSyncedAssessment(studentId, assessment) {
            const normalized = {
                learningLevel: app.normalizeLearningLevel(assessment?.learningLevel),
                note: String(assessment?.note ?? '').trim()
            };
            state.regularServerSyncedAssessments[studentId] = normalized;
            delete state.regularInheritedAssessments[studentId];
            delete state.regularAssessmentAutoSaveErrors[studentId];

            const draft = app.getRegularAssessmentDraft(studentId);
            if (draft.learningLevel === normalized.learningLevel && draft.note === normalized.note) {
                state.regularAssessmentTouched.delete(studentId);
            } else {
                state.regularAssessmentTouched.add(studentId);
            }
            app.refreshRegularAssessmentIndicators(studentId);
        }

function waitForRegularAssessmentAutosave(studentId) {
            return state.regularAssessmentAutoSavePromises[studentId] || Promise.resolve();
        }

function queueRegularLearningLevelAutosave(studentId) {
            const context = app.captureRegularContext();
            if (!context) return Promise.resolve();

            const learningLevel = app.getRegularLearningLevel(studentId);
            const token = (state.regularAssessmentAutoSaveTokens[studentId] || 0) + 1;
            state.regularAssessmentAutoSaveTokens[studentId] = token;
            state.regularAssessmentAutoSaveBusy.add(studentId);
            delete state.regularAssessmentAutoSaveErrors[studentId];
            app.refreshRegularAssessmentIndicators(studentId);

            const previous = state.regularAssessmentAutoSavePromises[studentId] || Promise.resolve();
            const queued = previous.catch(() => undefined).then(async () => {
                await app.ensureRegularAssessmentsLoaded(context);
                if (!app.isRegularContextCurrent(context)) return;

                const response = await fetch(
                    `/api/assessments/${encodeURIComponent(context.slotId)}/${encodeURIComponent(studentId)}/learning-level`,
                    {
                        method: 'PATCH',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            class_id: context.classId,
                            learning_level: learningLevel
                        })
                    }
                );
                const data = await response.json().catch(() => ({}));
                if (!response.ok || data.error) {
                    throw new Error(data.error || `Không thể lưu mức học (${response.status})`);
                }
                if (!app.isRegularContextCurrent(context)) return;
                app.applyRegularSyncedAssessment(studentId, data.assessment);
            }).catch(error => {
                if (!app.isRegularContextCurrent(context) || state.regularAssessmentAutoSaveTokens[studentId] !== token) return;
                state.regularAssessmentAutoSaveErrors[studentId] = error?.message || 'Không thể lưu mức học';
                app.refreshRegularAssessmentIndicators(studentId);
                app.showToast('Lỗi tự lưu mức học: ' + state.regularAssessmentAutoSaveErrors[studentId], 'error');
            }).finally(() => {
                if (state.regularAssessmentAutoSavePromises[studentId] === queued) {
                    delete state.regularAssessmentAutoSavePromises[studentId];
                }
                if (!app.isRegularContextCurrent(context) || state.regularAssessmentAutoSaveTokens[studentId] !== token) return;
                state.regularAssessmentAutoSaveBusy.delete(studentId);
                app.refreshRegularAssessmentIndicators(studentId);
            });

            state.regularAssessmentAutoSavePromises[studentId] = queued;
            return queued;
        }

function onRegularLearningLevelChange(studentId, value) {
            state.regularLearningLevelDrafts[studentId] = app.normalizeLearningLevel(value);
            state.regularAssessmentTouched.add(studentId);
            app.refreshRegularAssessmentIndicators(studentId);
            app.queueRegularLearningLevelAutosave(studentId);
        }

function onRegularNoteInput(studentId, value) {
            state.regularNoteDrafts[studentId] = value;
            state.regularAssessmentTouched.add(studentId);
            app.refreshRegularAssessmentIndicators(studentId);
        }

function renderStudents(studentList = null) {
            const list = document.getElementById('studentList');
            const isFinal = app.isFinalSession();
            const isCheckpoint = app.isCheckpointSession();
            app.configureStudentFilters();

            if (!state.regularReviewMode) document.body.classList.remove('regular-review-active');
            list.classList.remove('regular-review-mode');
            const toRender = studentList || app.getVisibleStudents();
            const filtersActive = !!(document.getElementById('searchStudent')?.value
                || document.getElementById('filterAttendance')?.value !== 'all'
                || document.getElementById('filterProgress')?.value !== 'all');

            list.classList.toggle('regular-mode', !isFinal && !isCheckpoint);
            list.setAttribute('aria-busy', String(!isFinal && !isCheckpoint && state.regularAssessmentLoad.loading));
            app.updateStudentCount(toRender.length);

            if (toRender.length === 0) {
                if (!isFinal && !isCheckpoint) state.selectedRegularStudentId = null;
                list.innerHTML = `
                    <div class="empty-state">
                        <img class="empty-state-visual" src="/assets/empty-students.jpg" alt="Minh họa danh sách và tiến độ học sinh" width="640" height="480" loading="lazy" decoding="async">
                        <div class="empty-state-text">${state.students.length === 0 ? 'Chưa có học sinh trong buổi này' : 'Không tìm thấy học sinh phù hợp'}</div>
                        ${filtersActive && state.students.length > 0 ? '<button type="button" class="btn btn-sm btn-outline" style="margin-top:12px" onclick="resetStudentFilters()">Xóa bộ lọc</button>' : ''}
                    </div>
                `;
                if (!isFinal && !isCheckpoint && state.regularReviewMode && typeof app.renderRegularReview === 'function') {
                    app.renderRegularReview();
                }
                return;
            }

            // Show demo banner for session 14
            if (isFinal) {
                list.innerHTML = `
                    <div class="demo-banner">
                        <div class="demo-banner-icon" aria-hidden="true">
                            <svg class="icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/><circle cx="12" cy="12" r="4.5" stroke-width="2"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>
                        </div>
                        <div>
                            <h3>Buổi 14 — Demo Sản phẩm cuối khóa</h3>
                            <p>Điểm demo sẽ được random trên 75% cho từng tiêu chí. Nhấn Submit để tự động chấm điểm.</p>
                        </div>
                    </div>
                `;
            } else if (isCheckpoint) {
                const sessionNum = app.getSessionNumberForTargets([5, 9]) || app.getCurrentSessionNumber();
                const cpNum = sessionNum === 5 ? 1 : 2;
                list.innerHTML = `
                    <div class="checkpoint-banner">
                        <div class="checkpoint-banner-icon" aria-hidden="true">
                            <svg class="icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                            </svg>
                        </div>
                        <div>
                            <h3>Buổi ${sessionNum} — Checkpoint ${cpNum}</h3>
                            <p>Nhập điểm lý thuyết và thực hành, hoặc để trống để hệ thống tự random 4–5 điểm. AI sẽ dựa trên ghi chú để tạo nhận xét tổng hợp.</p>
                        </div>
                    </div>
                `;
            } else {
                app.renderRegularStudents(toRender, list);
                if (state.regularReviewMode && typeof app.renderRegularReview === 'function') app.renderRegularReview();
                return;
            }

            toRender.forEach((att, idx) => {
                const initials = att.student.fullName.split(' ').slice(-2).map(n => n[0]).join('');
                const isPresent = app.isPresentAttendance(att);
                let statusText = '✕ Vắng';
                let statusClass = 'badge-gray';
                if (att.status === 'ATTENDED') { statusText = '✓ Có mặt'; statusClass = 'badge-success'; }
                else if (att.status === 'LATE_ARRIVED') { statusText = '⏰ Đi muộn'; statusClass = 'badge-warning'; }
                else if (att.status === 'ABSENT_WITH_NOTICE') { statusText = 'Vắng có phép'; statusClass = 'badge-gray'; }

                const hasRateScore = att.commentByAreas && att.commentByAreas.some(a => a.type === 'RATE');

                const div = document.createElement('div');

                // ===== FINAL DEMO UI (session 14) =====
                if (isFinal) {
                    const demoArea = att.commentByAreas?.find(a => a.type === 'DEMO');
                    const hasDemoScore = !!demoArea;
                    const demoQuestions = demoArea?.demoQuestions || [];

                    // Demo criteria config comes from the selected class courseProcess.
                    const demoConfig = app.getDemoConfig();

                    // Get existing scores or defaults
                    const studentScoreId = att.student.id.replace(/[^a-zA-Z0-9]/g, '_');
                    const scores = demoConfig.map((cfg, scoreIndex) => {
                        const existing = demoQuestions.find(q => q.courseProcessDemoDetailId === cfg.id);
                        return {
                            ...cfg,
                            score: state.demoScoresCache[studentScoreId]?.[scoreIndex] ?? (existing ? existing.score : '')
                        };
                    });

                    const totalExisting = scores.reduce((s, q) => s + (parseFloat(q.score) || 0), 0);
                    const totalMax = app.getDemoMaxTotal(demoConfig);

                    div.className = `student-card ${hasDemoScore ? 'has-comment' : 'no-comment'}`;
                    div.innerHTML = `
                        <div class="student-header">
                            <div class="student-info">
                                <div class="student-avatar">${initials}</div>
                                <div>
                                    <div class="student-name">${app.escapeHtml(att.student.fullName)}</div>
                                    <div class="student-meta">
                                        <span class="badge ${statusClass}">${statusText}</span>
                                        ${hasRateScore ? `<span class="badge badge-ability">Đã có điểm NL</span>` : ''}
                                    </div>
                                </div>
                            </div>
                            <span class="badge ${hasDemoScore ? 'badge-demo-done' : 'badge-demo'}">
                                ${hasDemoScore ? '✓ Đã chấm Demo' : 'Chưa chấm'}
                            </span>
                        </div>
                        ${isPresent ? `
                            <div class="demo-score-card ${hasDemoScore ? 'submitted' : ''}">
                                <div class="demo-score-title">${hasDemoScore ? 'Điểm Demo (có thể sửa)' : 'Chấm điểm Demo'}</div>
                                <table class="demo-score-table">
                                    <thead>
                                        <tr><th>Tiêu chí</th><th style="text-align:center">Điểm</th><th style="text-align:center">Max</th><th></th></tr>
                                    </thead>
                                    <tbody>
                                        ${scores.map((q, qi) => `
                                            <tr>
                                                <td class="demo-score-name">${app.escapeHtml(q.title)}</td>
                                                <td style="text-align:center">
                                                    <input type="number" 
                                                        id="dscore-${studentScoreId}-${qi}" 
                                                        class="form-input demo-score-input-compact" 
                                                        value="${q.score}" 
                                                        min="0" max="${q.maxScore}" step="0.25"
                                                        oninput="updateDemoTotal('${studentScoreId}')"
                                                    >
                                                </td>
                                                <td class="demo-score-max">/ ${app.formatScore(q.maxScore)}</td>
                                                <td><div class="demo-score-bar"><div class="demo-score-bar-fill" id="dbar-${studentScoreId}-${qi}" style="width:${q.score ? (q.score/q.maxScore*100).toFixed(0) : 0}%"></div></div></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                                <div class="demo-total-row">
                                    <span class="demo-total-label">Tổng điểm</span>
                                    <span class="demo-total-score" id="dtotal-${studentScoreId}">${totalExisting ? app.formatScore(totalExisting) : '?'} / ${app.formatScore(totalMax)}</span>
                                </div>
                            </div>
                            <div style="margin-top:10px;margin-bottom:-4px">
                                <label class="demo-auto-rate-label">
                                    <input type="checkbox" id="autoRate-${studentScoreId}"
                                        ${state.demoAutoRateCache[studentScoreId] === false ? '' : 'checked'}
                                        onchange="cacheDemoInputs('${studentScoreId}')">
                                    Tự điền điểm năng lực (5 điểm)
                                </label>
                            </div>
                            <div class="student-actions" style="margin-top:10px">
                                <button class="btn btn-sm btn-outline" onclick="randomDemoScores('${studentScoreId}')">
                                    <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" stroke-width="2"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/></svg>
                                    Random >75%
                                </button>
                                <button class="btn btn-sm btn-demo" onclick="submitDemoSingle('${att.student.id}', '${att._id}', '${studentScoreId}')" id="demo-btn-${studentScoreId}">
                                    ${hasDemoScore ? 'Re-submit Demo' : 'Submit Demo'}
                                </button>
                            </div>
                        ` : `
                            <div class="demo-score-card" style="opacity:0.5">
                                <div class="demo-score-title">Học sinh vắng — không chấm Demo</div>
                            </div>
                        `}
                    `;
                    list.appendChild(div);
                    return;
                }

                // ===== CHECKPOINT UI (session 5 and 9) =====
                if (isCheckpoint) {
                    const checkpointArea = att.commentByAreas?.find(a => a.type === 'CHECKPOINT');
                    const hasCheckpoint = !!checkpointArea;
                    const serverTheory = checkpointArea?.checkpoint?.checkpointScore || '';
                    const serverPractice = checkpointArea?.checkpoint?.practiceScore || '';
                    const existingContent = att.commentByAreas?.find(a => a.type === 'CONTENT')?.content || '';

                    const studentScoreId = att.student.id.replace(/[^a-zA-Z0-9]/g, '_');

                    // Use cached scores (user input) if available, otherwise fall back to server data
                    const cached = state.checkpointScoresCache[studentScoreId];
                    const existingTheory = cached ? cached.theory : serverTheory;
                    const existingPractice = cached ? cached.practice : serverPractice;
                    const hasExistingTheory = existingTheory !== '' && existingTheory !== null && existingTheory !== undefined;
                    const hasExistingPractice = existingPractice !== '' && existingPractice !== null && existingPractice !== undefined;
                    const hasExistingCompleteScores = hasExistingTheory && hasExistingPractice;
                    const existingAverage = hasExistingCompleteScores ? ((parseFloat(existingTheory) + parseFloat(existingPractice)) / 2).toFixed(1) : '?';
                    const existingRank = hasExistingCompleteScores ? app.getCheckpointRank(existingTheory, existingPractice) : '';

                    // Submission status from kiemtra (Cloudflare). Each student may have
                    // a submission on the original checkpoint and/or the makeup ("Kiểm tra bù").
                    const subStatus = state.checkpointSubmissionStatus[att.student.id] || null;
                    const hasKiemtraExam = state.checkpointStatusOriginal !== null || state.checkpointStatusMakeup !== null;
                    const origBranch = subStatus?.original || null;
                    const makeupBranch = subStatus?.makeup || null;
                    const hasBothBranches = !!origBranch && !!makeupBranch;
                    // Selected branch: per-student toggle, defaulting to the most recent submission.
                    const selectedBranchKey = state.checkpointBranchSelection[att.student.id]
                        || (makeupBranch ? 'makeup' : origBranch ? 'original' : null);
                    const activeBranch = selectedBranchKey === 'makeup' ? makeupBranch
                        : selectedBranchKey === 'original' ? origBranch : null;
                    const submittedAtRaw = activeBranch?.submittedAt || null;
                    const submittedLabel = submittedAtRaw ? new Date(submittedAtRaw).toLocaleString('vi-VN') : '';
                    const essayFiles = Array.isArray(activeBranch?.essayFiles) ? activeBranch.essayFiles : [];

                    let submissionBadge = '';
                    if (state.checkpointStatusLoading && !hasKiemtraExam) {
                        submissionBadge = `<span class="badge badge-loading">Đang tải nộp bài...</span>`;
                    } else if (hasKiemtraExam) {
                        if (activeBranch) {
                            const branchLabel = selectedBranchKey === 'makeup' ? ' (Bù)' : '';
                            submissionBadge = `<span class="badge badge-submitted">Đã nộp${branchLabel}${submittedLabel ? ' • ' + app.escapeHtml(submittedLabel) : ''}</span>`;
                        } else {
                            submissionBadge = `<span class="badge badge-missing">Chưa nộp bài</span>`;
                        }
                    }

                    // Per-student toggle between the original checkpoint and the makeup exam,
                    // shown only when the student submitted to both.
                    let branchToggle = '';
                    if (hasBothBranches) {
                        const origActive = selectedBranchKey === 'original';
                        const mkActive = selectedBranchKey === 'makeup';
                        branchToggle = `<span class="checkpoint-branch-toggle">`
                            + `<span class="badge checkpoint-branch ${origActive ? 'is-active' : ''}" onclick="event.stopPropagation(); setCheckpointBranch('${att.student.id}','original')">Gốc</span>`
                            + `<span class="badge checkpoint-branch ${mkActive ? 'is-active' : ''}" onclick="event.stopPropagation(); setCheckpointBranch('${att.student.id}','makeup')">Bù</span>`
                            + `</span>`;
                    }

                    // Use the active branch's own exam id + practiceType (submissions may live
                    // on a re-created exam or the makeup exam, not the newest original).
                    const scratchViewUrl = (activeBranch && activeBranch.practiceType === 'SCRATCH' && activeBranch.hasScratchFinal && activeBranch.examId)
                        ? `${app.KIEMTRA_BASE}/view/scratch/${encodeURIComponent(activeBranch.examId)}/${encodeURIComponent(att.student.id)}`
                        : '';
                    let submissionDetail = '';
                    if (activeBranch) {
                        const links = [];
                        if (scratchViewUrl) {
                            links.push(`<a href="${scratchViewUrl}" target="_blank" rel="noreferrer" class="badge badge-link-info">Xem Scratch</a>`);
                        }
                        essayFiles.forEach(f => {
                            links.push(`<a href="${f.url}" target="_blank" rel="noreferrer" class="badge badge-link-demo">${app.escapeHtml(f.fileName || 'File')}</a>`);
                        });
                        if (links.length) {
                            submissionDetail = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${links.join('')}</div>`;
                        }
                    }

                    // Accordion open/closed state persists across re-renders.
                    // Default: expand ungraded students, collapse already-graded ones.
                    const expandedState = state.checkpointExpanded[att.student.id];
                    const hasCheckpointComment = !!existingContent;
                    const isExpanded = expandedState === undefined ? !(hasCheckpoint || hasCheckpointComment) : expandedState;
                    const collapsedClass = isExpanded ? '' : 'collapsed';

                    // Compact score readout shown in the header (kept live by updateCheckpointTotal).
                    const headScore = hasExistingCompleteScores
                        ? `<span class="cp-head-score"><b id="cp-total-${studentScoreId}">${existingAverage}</b>/5</span><span class="checkpoint-rank ${existingRank}" id="cp-rank-${studentScoreId}">${existingRank}</span>`
                        : `<span class="cp-head-score cp-head-score-empty"><b id="cp-total-${studentScoreId}">${existingAverage}</b>/5</span><span class="checkpoint-rank ${existingRank}" id="cp-rank-${studentScoreId}">${existingRank}</span>`;

                    div.className = `student-card cp-accordion ${collapsedClass} ${hasCheckpoint || hasCheckpointComment ? 'has-comment' : 'no-comment'}`;
                    div.id = `cp-card-${studentScoreId}`;

                    if (!isPresent) {
                        div.innerHTML = `
                            <div class="cp-head" onclick="toggleCheckpointCard('${app.escapeInlineJsAttr(att.student.id)}', event)" role="button" tabindex="0"
                                 aria-expanded="${isExpanded}" aria-controls="cp-body-${studentScoreId}"
                                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleCheckpointCard('${app.escapeInlineJsAttr(att.student.id)}');}">
                                <div class="cp-head-left">
                                    <div class="student-avatar">${initials}</div>
                                    <div class="cp-head-info">
                                        <div class="student-name">${app.escapeHtml(att.student.fullName)}</div>
                                        <div class="student-meta"><span class="badge ${statusClass}">${statusText}</span></div>
                                    </div>
                                </div>
                                <div class="cp-head-right">
                                    <span class="badge badge-gray">Vắng — không chấm</span>
                                    <span class="badge ${hasCheckpointComment ? 'badge-checkpoint-done' : 'badge-checkpoint'}">${hasCheckpointComment ? '✓ Đã nhận xét' : '○ Chưa nhận xét'}</span>
                                    <svg class="cp-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                </div>
                            </div>
                            <div class="cp-body" id="cp-body-${studentScoreId}">
                                <div class="checkpoint-score-card checkpoint-absence-card">
                                    <div class="checkpoint-score-title">Không chấm điểm checkpoint</div>
                                    <p>Học sinh vắng nên hệ thống sẽ không tạo hoặc gửi điểm. Nhận xét AI vẫn được tạo theo cùng mẫu với học sinh đi học, dựa trên ghi chú bạn nhập.</p>
                                </div>
                                ${existingContent ? `
                                    <details class="cp-existing-details">
                                        <summary>Xem nhận xét hiện tại</summary>
                                        <div class="checkpoint-existing-comment">${existingContent}</div>
                                    </details>
                                ` : ''}
                                <div class="cp-comment-stack">
                                    <div class="checkpoint-comment-section cp-note-compact">
                                        <label class="checkpoint-label">
                                            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                            </svg>
                                            Ghi chú cho AI
                                        </label>
                                        <textarea id="cp-desc-${studentScoreId}" rows="2" placeholder="VD: Tư duy logic tốt; chủ động; cần luyện thêm phần thực hành..."
                                            oninput="updateCheckpointDescriptionDraft('${app.escapeInlineJsAttr(att.student.id)}', this.value)">${app.escapeHtml(app.getCheckpointDescriptionDraft(att.student.id))}</textarea>
                                    </div>
                                    ${state.generatedComments[att.student.id] ? `
                                        <div class="checkpoint-ai-comment">
                                            <div class="comment-box-label">
                                                <span class="checkpoint-ai-title">
                                                    <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                                                    </svg>
                                                    Nhận xét gửi phụ huynh (AI)
                                                </span>
                                                <button class="btn-icon" onclick="deleteComment('${app.escapeInlineJsAttr(att.student.id)}')" title="Xóa nhận xét">
                                                    <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                                    </svg>
                                                </button>
                                            </div>
                                            <textarea class="comment-edit" id="comment-${att.student.id}" oninput="updateComment('${app.escapeInlineJsAttr(att.student.id)}', this.value)">${app.escapeHtml(state.generatedComments[att.student.id].replace(/<[^>]*>/g, ''))}</textarea>
                                        </div>
                                    ` : `
                                        <div class="checkpoint-comment-section">
                                            <label class="checkpoint-label">
                                                <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
                                                </svg>
                                                Nhận xét gửi phụ huynh
                                            </label>
                                            <textarea class="comment-edit" id="comment-${att.student.id}" placeholder="Nhập nhận xét thủ công, hoặc bấm AI nhận xét để tạo tự động..." oninput="updateComment('${app.escapeInlineJsAttr(att.student.id)}', this.value)">${app.escapeHtml(state.manualComments[att.student.id] || '')}</textarea>
                                        </div>
                                    `}
                                </div>
                                <div class="student-actions checkpoint-actions">
                                    <button class="btn btn-sm btn-primary" onclick="generateCheckpointComment('${app.escapeInlineJsAttr(att.student.id)}', '${app.escapeInlineJsAttr(att.student.fullName)}', '${studentScoreId}')" id="cp-gen-btn-${studentScoreId}">
                                        <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                                        </svg>
                                        AI nhận xét
                                    </button>
                                    <button class="btn btn-sm btn-checkpoint" onclick="submitCheckpointCommentOnly('${app.escapeInlineJsAttr(att.student.id)}', '${app.escapeInlineJsAttr(att._id)}', '${studentScoreId}')" id="cp-comment-btn-${studentScoreId}">
                                        <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                                        </svg>
                                        Gửi nhận xét
                                    </button>
                                </div>
                            </div>`;
                        list.appendChild(div);
                        return;
                    }

                    div.innerHTML = `
                        <div class="cp-head" onclick="toggleCheckpointCard('${att.student.id}', event)" role="button" tabindex="0"
                             aria-expanded="${isExpanded}" aria-controls="cp-body-${studentScoreId}"
                             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleCheckpointCard('${att.student.id}');}">
                            <div class="cp-head-left">
                                <div class="student-avatar">${initials}</div>
                                <div class="cp-head-info">
                                    <div class="student-name">${app.escapeHtml(att.student.fullName)}</div>
                                    <div class="student-meta">
                                        <span class="badge ${statusClass}">${statusText}</span>
                                        ${hasRateScore ? `<span class="badge badge-nl" title="Đã có điểm năng lực">NL</span>` : ''}
                                        ${submissionBadge}
                                        ${branchToggle}
                                    </div>
                                </div>
                            </div>
                            <div class="cp-head-right">
                                ${headScore}
                                <span class="badge ${hasCheckpoint ? 'badge-checkpoint-done' : 'badge-checkpoint'}">${hasCheckpoint ? '✓ Đã chấm' : '○ Chưa'}</span>
                                <svg class="cp-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
                                </svg>
                            </div>
                        </div>
                        <div class="cp-body" id="cp-body-${studentScoreId}">
                            ${submissionDetail}
                            <div class="checkpoint-score-card ${hasCheckpoint ? 'submitted' : ''}">
                                <div class="checkpoint-score-row">
                                    <div class="checkpoint-score-input-group">
                                        <label>Điểm lý thuyết <span class="checkpoint-auto-chip">0–5</span></label>
                                        <input type="number" class="checkpoint-score-input"
                                            id="cp-theory-${studentScoreId}"
                                            value="${existingTheory}"
                                            min="0" max="5" step="0.5"
                                            placeholder="Auto"
                                            aria-label="Điểm lý thuyết checkpoint của ${app.escapeAttr(att.student.fullName)}"
                                            oninput="updateCheckpointTotal('${studentScoreId}')">
                                    </div>
                                    <div class="checkpoint-score-input-group">
                                        <label>Điểm thực hành <span class="checkpoint-auto-chip">0–5</span></label>
                                        <input type="number" class="checkpoint-score-input"
                                            id="cp-practice-${studentScoreId}"
                                            value="${existingPractice}"
                                            min="0" max="5" step="0.5"
                                            placeholder="Auto"
                                            aria-label="Điểm thực hành checkpoint của ${app.escapeAttr(att.student.fullName)}"
                                            oninput="updateCheckpointTotal('${studentScoreId}')">
                                    </div>
                                    <div class="checkpoint-total-row" aria-live="polite">
                                        <span class="checkpoint-total-label">Trung bình</span>
                                        <span>
                                            <span class="checkpoint-total-score" id="cp-bodytotal-${studentScoreId}">${existingAverage}</span>
                                            / 5
                                            <span class="checkpoint-rank ${existingRank}" id="cp-bodyrank-${studentScoreId}">${existingRank}</span>
                                        </span>
                                    </div>
                                </div>
                                <p class="checkpoint-inline-hint">Để trống = tự động random 4–5 điểm</p>
                            </div>
                            ${existingContent ? `
                                <details class="cp-existing-details">
                                    <summary>Xem nhận xét hiện tại</summary>
                                    <div class="checkpoint-existing-comment">${existingContent}</div>
                                </details>
                            ` : ''}
                            <div class="cp-comment-stack">
                                <div class="checkpoint-comment-section cp-note-compact">
                                    <label class="checkpoint-label">
                                        <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                        </svg>
                                        Ghi chú cho AI
                                    </label>
                                    <textarea id="cp-desc-${studentScoreId}" rows="2" placeholder="VD: Hoàn thành sản phẩm, tư duy logic tốt; cần luyện thuyết trình..."
                                        oninput="updateCheckpointDescriptionDraft('${app.escapeInlineJsAttr(att.student.id)}', this.value)">${app.escapeHtml(app.getCheckpointDescriptionDraft(att.student.id))}</textarea>
                                </div>
                                ${state.generatedComments[att.student.id] ? `
                                    <div class="checkpoint-ai-comment">
                                        <div class="comment-box-label">
                                            <span class="checkpoint-ai-title">
                                                <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                                                </svg>
                                                Nhận xét gửi phụ huynh (AI)
                                            </span>
                                            <button class="btn-icon" onclick="deleteComment('${att.student.id}')" title="Xóa nhận xét">
                                                <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                                </svg>
                                            </button>
                                        </div>
                                        <textarea class="comment-edit" id="comment-${att.student.id}" oninput="updateComment('${att.student.id}', this.value)">${state.generatedComments[att.student.id].replace(/<[^>]*>/g, '')}</textarea>
                                    </div>
                                ` : `
                                    <div class="checkpoint-comment-section">
                                        <label class="checkpoint-label">
                                            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
                                            </svg>
                                            Nhận xét gửi phụ huynh
                                        </label>
                                        <textarea class="comment-edit" id="comment-${att.student.id}" placeholder="Nhập nhận xét thủ công, hoặc bấm AI nhận xét để tạo tự động..." oninput="updateComment('${att.student.id}', this.value)">${state.manualComments[att.student.id] || ''}</textarea>
                                    </div>
                                `}
                            </div>
                            <div class="student-actions checkpoint-actions">
                                <button class="btn btn-sm btn-primary" onclick="generateCheckpointComment('${app.escapeInlineJsAttr(att.student.id)}', '${app.escapeInlineJsAttr(att.student.fullName)}', '${studentScoreId}')" id="cp-gen-btn-${studentScoreId}">
                                    <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                                    </svg>
                                    AI nhận xét
                                </button>
                                <button class="btn btn-sm btn-outline" onclick="submitCheckpointScoreSingle('${att.student.id}', '${att._id}', '${studentScoreId}')" id="cp-score-btn-${studentScoreId}">
                                    <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/>
                                    </svg>
                                    Submit điểm
                                </button>
                                <button class="btn btn-sm btn-checkpoint" onclick="submitCheckpointSingle('${att.student.id}', '${att._id}', '${studentScoreId}')" id="cp-btn-${studentScoreId}">
                                    <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                                    </svg>
                                    ${hasCheckpoint ? 'Re-submit' : 'Submit checkpoint'}
                                </button>
                            </div>
                        </div>
                    `;
                    list.appendChild(div);
                    return;
                }

                // ===== DEFAULT UI (regular sessions) =====
                const hasComment = app.hasContentComment(att);
                const existingComment = att.commentByAreas?.find(a => a.type === 'CONTENT')?.content || '';
                const generatedComment = state.generatedComments[att.student.id] || '';

                div.className = `student-card ${hasComment ? 'has-comment' : 'no-comment'}`;
                div.innerHTML = `
                    <div class="student-header">
                        <div class="student-info">
                            <div class="student-avatar">${initials}</div>
                            <div>
                                <div class="student-name">${app.escapeHtml(att.student.fullName)}</div>
                                <div class="student-meta">
                                    <span class="badge ${statusClass}">${statusText}</span>
                                    ${hasRateScore ? `<span class="badge badge-ability">Đã có điểm NL</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <span class="badge ${hasComment ? 'badge-success' : 'badge-warning'}">
                            ${hasComment ? '✓ Đã nhận xét' : '○ Chưa nhận xét'}
                        </span>
                    </div>
                    ${existingComment ? `
                        <div class="comment-box">
                            <div class="comment-box-label">Nhận xét hiện tại</div>
                            ${existingComment}
                        </div>
                    ` : ''}
                    ${generatedComment ? `
                        <div class="comment-box ai-generated">
                            <div class="comment-box-label">
                                <span>AI tạo</span>
                                <button class="btn-icon" onclick="deleteComment('${att.student.id}')" title="Xóa nhận xét">
                                    <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                            <textarea class="comment-edit" id="comment-${att.student.id}" oninput="updateComment('${att.student.id}', this.value)">${generatedComment.replace(/<[^>]*>/g, '')}</textarea>
                        </div>
                    ` : ''}
                    <div class="note-input">
                        <input type="text" class="form-input" id="note-${att.student.id}" placeholder="Ghi chú: học tập trung, hay chơi game..." value="${app.getLocalNote(att.student.id)}">
                        <button class="btn btn-sm btn-outline" onclick="saveNote('${att.student.id}')">
                            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
                            </svg>
                        </button>
                    </div>
                    <div class="template-buttons">
                        <button class="btn btn-xs btn-template" onclick="applyTemplate('${att.student.id}', 'good')">Tốt</button>
                        <button class="btn btn-xs btn-template" onclick="applyTemplate('${att.student.id}', 'asks')">Chủ động hỏi</button>
                        <button class="btn btn-xs btn-template" onclick="applyTemplate('${att.student.id}', 'needwork')">Cần cố gắng</button>
                        <button class="btn btn-xs btn-template" onclick="applyTemplate('${att.student.id}', 'naughty')">Hay nghịch</button>
                        <button class="btn btn-xs btn-template" onclick="showPastComments('${app.escapeInlineJsAttr(att.student.id)}', '${app.escapeInlineJsAttr(att.student.fullName)}')">Xem buổi trước</button>
                    </div>
                    <div class="student-actions">
                        <button class="btn btn-sm btn-primary" onclick="generateSingle('${app.escapeInlineJsAttr(att.student.id)}')" id="gen-btn-${att.student.id}">
                            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                            </svg>
                            Tạo nhận xét
                        </button>
                        ${generatedComment ? `
                            <button class="btn btn-sm btn-success" onclick="submitSingle('${att.student.id}', '${att._id}')">
                                <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                                </svg>
                                Submit
                            </button>
                            <button class="btn btn-sm btn-outline" onclick="copyZaloComment('${app.escapeInlineJsAttr(att.student.fullName)}','${app.escapeInlineJsAttr(att.student.id)}')">
                                <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
                                </svg>
                                Zalo
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="deleteComment('${att.student.id}')">
                                <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                            </button>
                        ` : ''}
                    </div>
                `;
                list.appendChild(div);
            });
        }

async function persistStudentAssessment(context, studentId, assessment) {
            if (!context?.classId || !context?.slotId) throw new Error('Chưa chọn lớp hoặc buổi học');
            const normalized = {
                learningLevel: app.normalizeLearningLevel(assessment?.learningLevel),
                note: String(assessment?.note ?? '').trim()
            };
            const synced = state.regularServerSyncedAssessments[studentId];
            if (synced
                && synced.learningLevel === normalized.learningLevel
                && synced.note === normalized.note) {
                if (app.isRegularContextCurrent(context)) {
                    state.regularAssessmentTouched.delete(studentId);
                    delete state.regularAssessmentAutoSaveErrors[studentId];
                    app.refreshRegularAssessmentIndicators(studentId);
                }
                return false;
            }

            const response = await fetch(`/api/assessments/${encodeURIComponent(context.slotId)}/${encodeURIComponent(studentId)}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    class_id: context.classId,
                    learning_level: normalized.learningLevel,
                    note: normalized.note
                })
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `Không thể lưu đánh giá (${response.status})`);
            }
            if (app.isRegularContextCurrent(context)) {
                const data = await response.json().catch(() => ({}));
                app.applyRegularSyncedAssessment(studentId, data.assessment || normalized);
            }
            return true;
        }

async function persistRegularStudentSnapshots(context, studentSnapshots, concurrency = 3) {
            await app.runWithConcurrency(studentSnapshots, concurrency, async snapshot => {
                await app.waitForRegularAssessmentAutosave(snapshot.studentId);
                if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');
                await app.persistStudentAssessment(context, snapshot.studentId, snapshot.assessment);
            });
        }

async function setLearningLevelForAll(learningLevel) {
            if (!Object.prototype.hasOwnProperty.call(app.LEARNING_LEVELS, learningLevel)) return;
            const context = app.captureRegularContext();
            if (!context) return;
            if (app.isRegularOperationActive()) {
                app.showToast('Vui lòng đợi thao tác đang chạy hoàn tất', 'info');
                return;
            }

            const normalizedLevel = app.normalizeLearningLevel(learningLevel);
            const levelInfo = app.getCurrentLevelInfo(normalizedLevel);
            const presentStudents = state.students.filter(app.isPresentAttendance);
            if (presentStudents.length === 0) {
                app.showToast('Không có học sinh có mặt để thay đổi level', 'info');
                return;
            }

            const previousByStudent = new Map();
            const successfulIds = new Set();
            const failures = [];
            let targets = [];
            let localDraftsApplied = false;
            let busyStarted = false;

            try {
                await app.ensureRegularAssessmentsLoaded(context);
                if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');

                targets = presentStudents.filter(att => app.getRegularLearningLevel(att.student.id) !== normalizedLevel);
                if (targets.length === 0) {
                    app.showToast(`Tất cả học sinh có mặt đã ở ${levelInfo.code}`, 'info');
                    return;
                }

                const draftStudentIds = new Set(targets.filter(att => !!state.generatedComments[att.student.id]).map(att => att.student.id));
                const existingDraftCount = draftStudentIds.size;
                const confirmed = await app.confirmDialog({
                    title: `Đặt ${levelInfo.code} cho cả lớp?`,
                    message: `Mức độ hiểu bài của ${targets.length} học sinh có mặt sẽ đổi thành ${levelInfo.code} · ${levelInfo.label}.${existingDraftCount ? ` ${existingDraftCount} bản nháp AI hiện có sẽ được giữ nguyên và không tự tạo lại.` : ''}`,
                    confirmText: `Đặt ${levelInfo.code}`,
                    cancelText: 'Hủy',
                    tone: existingDraftCount ? 'warning' : 'info'
                });
                if (!confirmed) return;
                if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');

                targets.forEach(att => {
                    const studentId = att.student.id;
                    previousByStudent.set(studentId, {
                        hadDraft: Object.prototype.hasOwnProperty.call(state.regularLearningLevelDrafts, studentId),
                        learningLevel: app.getRegularLearningLevel(studentId),
                        wasTouched: state.regularAssessmentTouched.has(studentId)
                    });
                    state.regularLearningLevelDrafts[studentId] = normalizedLevel;
                    state.regularAssessmentTouched.add(studentId);
                });
                localDraftsApplied = true;
                state.regularBulkLevelBusy = true;
                busyStarted = true;
                app.renderStudents();
                app.updateStats();

                await app.runWithConcurrency(targets, 3, async att => {
                    const studentId = att.student.id;
                    try {
                        if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');
                        await app.persistStudentAssessment(context, studentId, app.getRegularAssessmentDraft(studentId));
                        successfulIds.add(studentId);
                    } catch (error) {
                        failures.push({
                            studentId,
                            studentName: att.student.fullName || '',
                            message: error?.message || 'Không xác định'
                        });
                    }
                });

                if (!app.isRegularContextCurrent(context)) return;
                failures.forEach(({ studentId }) => {
                    const previous = previousByStudent.get(studentId);
                    if (!previous) return;
                    if (previous.hadDraft) state.regularLearningLevelDrafts[studentId] = previous.learningLevel;
                    else delete state.regularLearningLevelDrafts[studentId];
                    if (previous.wasTouched) state.regularAssessmentTouched.add(studentId);
                    else state.regularAssessmentTouched.delete(studentId);
                });

                const successfulDraftCount = Array.from(successfulIds).filter(studentId => draftStudentIds.has(studentId)).length;
                const draftWarning = successfulDraftCount
                    ? ` ${successfulDraftCount} bản nháp AI được giữ nguyên; hãy tạo lại để nội dung khớp level mới.`
                    : '';
                if (failures.length > 0) {
                    app.showToast(
                        `Đã đặt ${levelInfo.code} cho ${successfulIds.size}/${targets.length} học sinh. Không lưu được: ${failures.slice(0, 3).map(item => item.studentName).join(', ')}${failures.length > 3 ? '...' : ''}.${draftWarning}`,
                        'warning'
                    );
                } else {
                    app.showToast(`Đã đặt ${levelInfo.code} cho ${presentStudents.length} học sinh có mặt.${draftWarning}`, successfulDraftCount ? 'warning' : 'success');
                }
            } catch (error) {
                if (localDraftsApplied && app.isRegularContextCurrent(context)) {
                    targets.forEach(att => {
                        const studentId = att.student.id;
                        if (successfulIds.has(studentId)) return;
                        const previous = previousByStudent.get(studentId);
                        if (!previous) return;
                        if (previous.hadDraft) state.regularLearningLevelDrafts[studentId] = previous.learningLevel;
                        else delete state.regularLearningLevelDrafts[studentId];
                        if (previous.wasTouched) state.regularAssessmentTouched.add(studentId);
                        else state.regularAssessmentTouched.delete(studentId);
                    });
                }
                if (app.isRegularContextCurrent(context)) {
                    app.showToast('Lỗi đổi level cả lớp: ' + (error.message || 'Không xác định'), 'error');
                }
            } finally {
                if (busyStarted) state.regularBulkLevelBusy = false;
                app.syncRegularOperationLock();
                if (app.isRegularContextCurrent(context)) {
                    app.renderStudents();
                    app.updateStats();
                }
            }
        }

async function saveAssessment(studentId) {
            const context = app.captureRegularContext();
            if (!context) return;
            if (app.isRegularOperationActive()) {
                app.showToast('Vui lòng đợi thao tác đang chạy hoàn tất', 'info');
                return;
            }
            const domId = app.getRegularStudentDomId(studentId);
            const button = document.getElementById(`save-note-${domId}`);
            const originalHtml = button?.innerHTML;
            state.regularAssessmentSaveBusy.add(studentId);
            app.syncRegularOperationLock();
            app.updateStats();
            if (button) {
                button.disabled = true;
                button.setAttribute('aria-busy', 'true');
                button.textContent = 'Đang lưu...';
            }

            try {
                await app.ensureRegularAssessmentsLoaded(context);
                await app.waitForRegularAssessmentAutosave(studentId);
                if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');
                const changed = await app.persistStudentAssessment(context, studentId, app.getRegularAssessmentDraft(studentId));
                app.showToast(changed ? 'Đã lưu đánh giá!' : 'Không có thay đổi', changed ? 'success' : 'info');
            } catch (error) {
                app.showToast('Lỗi lưu đánh giá: ' + error.message, 'error');
            } finally {
                state.regularAssessmentSaveBusy.delete(studentId);
                app.syncRegularOperationLock();
                if (app.isRegularContextCurrent(context)) app.updateStats();
                if (button?.isConnected && app.isRegularContextCurrent(context)) {
                    button.disabled = state.regularAssessmentLoad.loading;
                    button.setAttribute('aria-busy', 'false');
                    button.innerHTML = originalHtml;
                }
            }
        }

async function saveNote(studentId) {
            return app.saveAssessment(studentId);
        }


Object.assign(app, {
    getRegularStudentDomId,
    stripHtmlText,
    getStudentCallName,
    normalizeLearningLevel,
    getCurrentLevelCatalog,
    getCurrentLevelInfo,
    getRegularLearningLevel,
    getRegularNoteValue,
    captureRegularContext,
    isRegularContextCurrent,
    getRegularAssessmentDraft,
    getRegularAssessmentStatus,
    snapshotRegularStudent,
    runWithConcurrency,
    ensureRegularAssessmentsLoaded,
    getPreviousRegularSlotIds,
    loadRegularAssessments,
    retryRegularAssessments,
    getAttendancePresentation,
    getRegularStudentUiState,
    getRegularStudentPreview,
    buildRegularStudentListItem,
    buildRegularStudentDetail,
    renderRegularStudents,
    selectRegularStudent,
    syncRegularDetailPlacement,
    refreshRegularAssessmentIndicators,
    applyRegularSyncedAssessment,
    waitForRegularAssessmentAutosave,
    queueRegularLearningLevelAutosave,
    onRegularLearningLevelChange,
    onRegularNoteInput,
    renderStudents,
    persistStudentAssessment,
    persistRegularStudentSnapshots,
    setLearningLevelForAll,
    saveAssessment,
    saveNote
});
