import { app } from './registry.js';
import { state } from './state.js';

let confirmModalReturnFocusElement = null;
let pastCommentsReturnFocusElement = null;

function restoreDialogFocus(element) {
            if (!state.regularReviewMode) return;
            requestAnimationFrame(() => {
                const target = element?.isConnected ? element : document.getElementById('closeRegularReviewModal');
                target?.focus();
            });
        }

function getLocalNote(studentId) {
            const notes = JSON.parse(localStorage.getItem('studentNotes') || '{}');
            return notes[studentId] || '';
        }

function setLocalNote(studentId, note) {
            const notes = JSON.parse(localStorage.getItem('studentNotes') || '{}');
            notes[studentId] = note;
            localStorage.setItem('studentNotes', JSON.stringify(notes));
        }

function getCurrentStudentMode() {
            if (app.isFinalSession()) return 'demo';
            if (app.isCheckpointSession()) return 'checkpoint';
            return 'regular';
        }

function closeDetailsMenu(trigger) {
            const details = trigger?.closest?.('details');
            const summary = details?.querySelector(':scope > summary');
            details?.removeAttribute('open');
            requestAnimationFrame(() => summary?.focus());
        }

function hasModeSubmission(att, mode = app.getCurrentStudentMode()) {
            if (mode === 'demo') return app.hasAreaType(att, 'DEMO') || app.hasContentComment(att);
            if (mode === 'checkpoint') return app.hasAreaType(att, 'CHECKPOINT') || app.hasContentComment(att);
            return app.hasContentComment(att);
        }

function getStudentProgressState(att, mode = app.getCurrentStudentMode()) {
            const studentId = att?.student?.id;
            if (mode !== 'demo' && (state.generatedComments[studentId] || String(state.manualComments[studentId] || '').trim())) {
                return 'draft';
            }
            return app.hasModeSubmission(att, mode) ? 'submitted' : 'pending';
        }

function configureStudentFilters() {
            const mode = app.getCurrentStudentMode();
            const pendingOption = document.getElementById('filterProgressPending');
            const draftOption = document.getElementById('filterProgressDraft');
            const submittedOption = document.getElementById('filterProgressSubmitted');
            const progressSelect = document.getElementById('filterProgress');

            if (!pendingOption || !draftOption || !submittedOption || !progressSelect) return;

            pendingOption.textContent = mode === 'regular' ? 'Chưa xử lý' : 'Chưa chấm';
            draftOption.textContent = 'Bản nháp AI';
            submittedOption.textContent = mode === 'demo' ? 'Đã chấm Demo' : mode === 'checkpoint' ? 'Đã chấm' : 'Đã gửi LMS';
            draftOption.hidden = mode === 'demo';
            draftOption.disabled = mode === 'demo';
            if (mode === 'demo' && progressSelect.value === 'draft') progressSelect.value = 'all';
        }

function getVisibleStudents() {
            const search = app.normalizeVietnameseText(document.getElementById('searchStudent')?.value || '');
            const attendance = document.getElementById('filterAttendance')?.value || 'all';
            const progress = document.getElementById('filterProgress')?.value || 'all';
            const mode = app.getCurrentStudentMode();

            state.filteredStudents = state.students.filter(att => {
                const matchName = app.normalizeVietnameseText(att?.student?.fullName || '').includes(search);
                const isPresent = app.isPresentAttendance(att);
                const matchAttendance = attendance === 'all'
                    || (attendance === 'present' && isPresent)
                    || (attendance === 'absent' && !isPresent);
                const matchProgress = progress === 'all' || app.getStudentProgressState(att, mode) === progress;
                return matchName && matchAttendance && matchProgress;
            });

            return state.filteredStudents;
        }

function updateStudentCount(visibleCount = state.students.length) {
            const count = document.getElementById('studentCount');
            if (!count) return;
            count.textContent = visibleCount === state.students.length
                ? `${state.students.length} học sinh`
                : `${visibleCount}/${state.students.length} học sinh`;
        }

function filterStudents() {
            if (app.isCheckpointSession()) {
                app.saveCheckpointScoresToCache();
                app.saveCheckpointDescriptionsToCache();
            } else if (app.isFinalSession()) {
                app.saveDemoInputsToCache();
            }
            state.regularListScrollTop = 0;
            app.renderStudents();
        }

function resetStudentFilters() {
            const search = document.getElementById('searchStudent');
            const attendance = document.getElementById('filterAttendance');
            const progress = document.getElementById('filterProgress');
            if (search) search.value = '';
            if (attendance) attendance.value = 'all';
            if (progress) progress.value = 'all';
            app.filterStudents();
        }

async function refreshClassData() {
            if (!state.classData) return;
            if (app.isRegularOperationActive()) {
                app.showToast('Vui lòng đợi thao tác đang chạy hoàn tất trước khi refresh', 'info');
                return;
            }
            if (!(await app.confirmDiscardRegularWork())) return;

            app.showToast('Đang refresh...', 'info');
            const requestedClassId = state.classData.id;
            const slotId = state.selectedSlot?._id;
            const refreshToken = ++state.classRefreshToken;
            state.regularRefreshBusy = true;
            app.syncRegularOperationLock();
            app.updateStats();

            try {
                const result = await app.lmsApiCall("GetClassById", app.CLASS_DETAIL_QUERY, {id: requestedClassId});
                if (refreshToken !== state.classRefreshToken || state.classData?.id !== requestedClassId) return;
                if (result.errors) {
                    app.showToast('Lỗi refresh: ' + result.errors[0]?.message, 'error');
                    return;
                }
                app.discardRegularWorkState();
                state.selectedSlot = null;
                state.classData = result?.data?.classesById;
                app.mergeClassDetailIntoCache(state.classData);

                // Rebuild slot dropdown
                const slotSelect = document.getElementById('slotSelect');
                slotSelect.innerHTML = '<option value="">-- Chọn buổi --</option>';
                state.classData.slots.forEach((slot, idx) => {
                    const date = new Date(slot.date).toLocaleDateString('vi-VN');
                    const opt = document.createElement('option');
                    opt.value = idx;
                    opt.textContent = `Buổi ${app.getSlotDisplayNumber(slot, idx)} - ${date}`;
                    slotSelect.appendChild(opt);
                });

                // Re-select the same slot
                if (slotId) {
                    const newIdx = state.classData.slots.findIndex(s => s._id === slotId);
                    if (newIdx >= 0) {
                        slotSelect.value = newIdx;
                        app.loadSlotStudents();
                    }
                }
                app.showToast('Đã refresh dữ liệu!');
            } catch (e) {
                if (refreshToken === state.classRefreshToken && state.classData?.id === requestedClassId) {
                    app.showToast('Lỗi refresh dữ liệu', 'error');
                }
            } finally {
                if (refreshToken === state.classRefreshToken) {
                    state.regularRefreshBusy = false;
                    app.syncRegularOperationLock();
                    app.updateStats();
                }
            }
        }

function exportToCSV() {
            if (state.students.length === 0) {
                app.showToast('Không có dữ liệu để export', 'error');
                return;
            }
            
            const isRegularMode = !app.isFinalSession() && !app.isCheckpointSession();
            const headers = isRegularMode
                ? ['Họ tên', 'Trạng thái', 'Mức độ nắm bài', 'Ghi chú bổ sung', 'Nhận xét hiện tại', 'Nhận xét AI']
                : ['Họ tên', 'Trạng thái', 'Nhận xét hiện tại', 'Nhận xét AI'];
            const rows = state.students.map(s => {
                const existingComment = s.commentByAreas?.find(a => a.type === 'CONTENT')?.content?.replace(/<[^>]*>/g, '') || '';
                const aiComment = state.generatedComments[s.student.id]?.replace(/<[^>]*>/g, '') || '';
                const status = s.status === 'ATTENDED' ? 'Có mặt' : s.status === 'LATE_ARRIVED' ? 'Đi muộn' : 'Vắng';
                if (!isRegularMode) return [s.student.fullName, status, existingComment, aiComment];
                const levelInfo = app.LEARNING_LEVELS[app.getRegularLearningLevel(s.student.id)];
                return [
                    s.student.fullName,
                    status,
                    `${levelInfo.code} - ${levelInfo.label}`,
                    app.getRegularNoteValue(s.student.id),
                    existingComment,
                    aiComment
                ];
            });
            
            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');
            
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `nhanxet_${state.classData?.name || 'class'}_buoi${(state.selectedSlot?.index || 0) + 1}.csv`;
            link.click();
            app.showToast('Đã export CSV!');
        }

function showPastComments(studentId, studentName) {
            pastCommentsReturnFocusElement = document.activeElement;
            const pastSlots = app.getPastComments(studentId);
            
            document.getElementById('pastCommentsStudentName').textContent = studentName;
            
            if (pastSlots.length === 0) {
                document.getElementById('pastCommentsContent').innerHTML = `
                    <div style="text-align: center; color: var(--gray-500); padding: 20px;">
                        Chưa có nhận xét nào từ các buổi trước
                    </div>
                `;
            } else {
                const html = pastSlots.map(slot => {
                    const content = slot.commentByAreas?.find(a => a.type === 'CONTENT')?.content || '';
                    const cleanContent = content.replace(/<[^>]*>/g, '');
                    return `
                        <div class="confirm-preview-item">
                            <div class="confirm-preview-name">Buổi ${slot.index}</div>
                            <div class="confirm-preview-comment">${cleanContent || 'Không có nhận xét'}</div>
                        </div>
                    `;
                }).join('');
                document.getElementById('pastCommentsContent').innerHTML = html;
            }
            
            document.getElementById('pastCommentsModal').classList.remove('hidden');
            requestAnimationFrame(() => document.getElementById('pastCommentsCloseButton')?.focus());
        }

function hidePastCommentsModal() {
            document.getElementById('pastCommentsModal').classList.add('hidden');
            const returnFocus = pastCommentsReturnFocusElement;
            pastCommentsReturnFocusElement = null;
            restoreDialogFocus(returnFocus);
        }

function getSlotDisplayNumber(slot, arrayIndex = null) {
            const slotIndex = Number(slot?.index);
            const hasArrayIndex = arrayIndex !== '' && arrayIndex != null && Number.isFinite(Number(arrayIndex));
            const positionNumber = hasArrayIndex ? Number(arrayIndex) + 1 : null;
            if (!Number.isFinite(slotIndex)) return positionNumber || 1;
            if (positionNumber && slotIndex === positionNumber) return slotIndex;
            if (positionNumber && slotIndex + 1 === positionNumber) return positionNumber;
            return slotIndex + 1;
        }

function isPresentAttendance(att) {
            return att?.status === 'ATTENDED' || att?.status === 'LATE_ARRIVED';
        }

function hasAreaType(att, areaType, requireContent = false) {
            const areas = Array.isArray(att?.commentByAreas) ? att.commentByAreas : [];
            return areas.some(area => {
                if (area?.type !== areaType) return false;
                // Some lightweight list queries fetch only `type`. In that case the
                // presence of CONTENT/DEMO/CHECKPOINT means the slot was submitted.
                if (!requireContent || !Object.prototype.hasOwnProperty.call(area, 'content')) return true;
                return String(area.content || '').trim().length > 0;
            });
        }

function hasContentComment(att) {
            return app.hasAreaType(att, 'CONTENT', true);
        }

function isSlotCompletedForAttendance(att, slot, slotIdx = null) {
            if (!app.isPresentAttendance(att)) return true;
            const sessionNumber = app.getSlotDisplayNumber(slot, slotIdx);
            if (sessionNumber === 14) return app.hasAreaType(att, 'DEMO') || app.hasContentComment(att);
            if ([5, 9].includes(sessionNumber)) return app.hasAreaType(att, 'CHECKPOINT') || app.hasContentComment(att);
            return app.hasContentComment(att);
        }

function getSlotCommentProgress(slot, slotIdx = null) {
            const attendance = Array.isArray(slot?.studentAttendance) ? slot.studentAttendance : [];
            const present = attendance.filter(app.isPresentAttendance);
            const completed = present.filter(att => app.isSlotCompletedForAttendance(att, slot, slotIdx)).length;
            const missing = Math.max(present.length - completed, 0);
            return {
                present: present.length,
                completed,
                missing,
                done: present.length > 0 && missing === 0
            };
        }

function findLatestCommentableSlotIndex(slots) {
            if (!Array.isArray(slots)) return -1;
            const now = new Date();
            for (let i = slots.length - 1; i >= 0; i--) {
                const slot = slots[i];
                const attendance = Array.isArray(slot?.studentAttendance) ? slot.studentAttendance : [];
                if (!attendance.length) continue;
                const slotDate = new Date(slot.date);
                if (Number.isNaN(slotDate.getTime()) || slotDate <= now) return i;
            }
            return -1;
        }

function getClassCommentProgress(cls) {
            const slots = Array.isArray(cls?.slots) ? cls.slots : [];
            const latestIdx = app.findLatestCommentableSlotIndex(slots);
            if (latestIdx < 0) {
                return { state: 'unknown', badgeText: 'Chưa có dữ liệu', meta: '' };
            }

            let pendingIdx = -1;
            let pendingProgress = null;
            for (let i = latestIdx; i >= 0; i--) {
                const progress = app.getSlotCommentProgress(slots[i], i);
                if (progress.present > 0 && progress.missing > 0) {
                    pendingIdx = i;
                    pendingProgress = progress;
                }
            }

            if (pendingIdx >= 0) {
                return {
                    state: 'pending',
                    badgeText: 'Chưa nhận xét',
                    slotNumber: app.getSlotDisplayNumber(slots[pendingIdx], pendingIdx),
                    ...pendingProgress
                };
            }

            const doneProgress = app.getSlotCommentProgress(slots[latestIdx], latestIdx);
            return {
                state: 'done',
                badgeText: 'Đã nhận xét',
                slotNumber: app.getSlotDisplayNumber(slots[latestIdx], latestIdx),
                ...doneProgress
            };
        }

function getClassCommentMeta(progress) {
            if (!progress || progress.state === 'unknown') return 'Chưa có buổi đã điểm danh';
            if (progress.state === 'pending') {
                return `Buổi ${progress.slotNumber}: còn ${progress.missing}/${progress.present} học sinh chưa nhận xét`;
            }
            return `Buổi ${progress.slotNumber}: ${progress.completed}/${progress.present} học sinh đã nhận xét`;
        }

function mergeClassDetailIntoCache(detail) {
            if (!detail || !state.classesCache) return;
            const idx = state.classesCache.findIndex(cls => cls.id === detail.id);
            if (idx < 0) return;
            const previous = state.classesCache[idx];
            state.classesCache[idx] = {
                ...previous,
                ...detail,
                status: previous.status,
                startDate: previous.startDate,
                endDate: previous.endDate,
                recentlyEnded: previous.recentlyEnded
            };
            state.selectedClass = state.classesCache[idx];
            app.renderClassList(state.classesCache);
        }

function autoSelectLatestSlot() {
            if (!state.classData || !state.classData.slots) return;

            const latestIdx = app.findLatestCommentableSlotIndex(state.classData.slots);
            if (latestIdx < 0) return;

            const latestSlot = state.classData.slots[latestIdx];
            const latestNum = app.getSlotDisplayNumber(latestSlot, latestIdx);

            // Find the earliest unfinished slot (from latest backwards)
            let uncommentedIdx = -1;
            for (let i = latestIdx; i >= 0; i--) {
                const progress = app.getSlotCommentProgress(state.classData.slots[i], i);
                if (progress.present > 0 && progress.missing > 0) {
                    uncommentedIdx = i;
                }
            }

            if (uncommentedIdx >= 0) {
                const uncommentedNum = app.getSlotDisplayNumber(state.classData.slots[uncommentedIdx], uncommentedIdx);
                document.getElementById('slotSelect').value = uncommentedIdx;
                app.loadSlotStudents();
                if (uncommentedIdx === latestIdx) {
                    app.showToast(`Buổi gần nhất: ${latestNum} - chưa nhận xét`, 'info');
                } else {
                    app.showToast(`Buổi gần nhất: ${latestNum} ✓ | Buổi chưa nhận xét: ${uncommentedNum}`, 'warning');
                }
            } else {
                // All slots are fully commented, select the latest
                document.getElementById('slotSelect').value = latestIdx;
                app.loadSlotStudents();
                app.showToast(`Buổi gần nhất: ${latestNum} - Đã nhận xét đầy đủ!`, 'success');
            }
        }

function isRegularOperationActive() {
            return state.regularBatchBusy || state.regularBulkLevelBusy || state.regularRefreshBusy || state.regularStudentBusy.size > 0 || state.regularAssessmentSaveBusy.size > 0;
        }

function isRegularAssessmentUnavailable() {
            return state.regularAssessmentLoad.loading || !!state.regularAssessmentLoad.error;
        }

function hasDirtyRegularAssessmentDrafts() {
            return Array.from(state.regularAssessmentTouched).some(studentId => {
                const draft = app.getRegularAssessmentDraft(studentId);
                const synced = state.regularServerSyncedAssessments[studentId];
                return !synced || synced.learningLevel !== draft.learningLevel || synced.note !== draft.note;
            });
        }

function hasUnsavedRegularWork() {
            return app.hasDirtyRegularAssessmentDrafts() || Object.keys(state.generatedComments).length > 0;
        }

function discardRegularWorkState() {
            state.generatedComments = {};
            state.regularAssessmentContextEpoch += 1;
            state.generatedCommentMeta = {};
            state.regularNoteDrafts = {};
            state.regularLearningLevelDrafts = {};
            state.regularServerSyncedAssessments = {};
            state.regularInheritedAssessments = {};
            state.regularAssessmentTouched.clear();
            state.regularAssessmentAutoSaveBusy.clear();
            state.regularAssessmentAutoSaveErrors = {};
            state.selectedRegularStudentId = null;
            state.regularReviewMode = false;
            state.regularReviewSelectedStudentId = null;
            state.regularReviewSearch = '';
            state.regularReviewAlertFilter = 'all';
            state.regularReviewLevelFilter = 'all';
            state.regularReviewSort = 'name';
            state.regularReviewScrollTop = 0;
            state.regularReviewDrawerScrollTop = 0;
            state.regularReviewShouldResetScroll = false;
            state.regularReviewSubmitScopeIds = null;
            state.regularOperationErrors = {};
            state.regularUiSlotId = null;
            document.body.classList.remove('regular-review-active');
            app.forceCloseRegularReviewModal?.(false);
        }

function confirmDiscardRegularWork() {
            if (!app.hasUnsavedRegularWork()) return Promise.resolve(true);
            return app.confirmDialog({
                title: 'Bỏ thay đổi chưa lưu?',
                message: 'Bạn đang có đánh giá chưa lưu hoặc bản nháp AI chưa gửi. Chuyển đi sẽ bỏ các thay đổi này.',
                confirmText: 'Bỏ thay đổi',
                cancelText: 'Ở lại',
                tone: 'warning',
                dangerConfirm: true
            });
        }

function confirmRegularNavigation(event) {
            if (app.isRegularOperationActive()) {
                event?.preventDefault();
                app.showToast('Vui lòng đợi thao tác đang chạy hoàn tất', 'info');
                return false;
            }
            if (!app.hasUnsavedRegularWork()) return true;
            event?.preventDefault();
            app.confirmDiscardRegularWork().then(ok => {
                if (ok) window.location.href = '/homework';
            });
            return false;
        }

function setBatchLevelMenuDisabled(disabled) {
            const details = document.getElementById('batchLevelMenu');
            const summary = document.getElementById('batchLevelBtn');
            details?.classList.toggle('is-disabled', disabled);
            if (summary) {
                summary.setAttribute('aria-disabled', String(disabled));
                summary.tabIndex = disabled ? -1 : 0;
                summary.style.pointerEvents = disabled ? 'none' : '';
            }
            document.querySelectorAll('#batchLevelMenu .batch-level-action').forEach(button => {
                button.disabled = disabled;
            });
            if (disabled) details?.removeAttribute('open');
        }

function syncRegularOperationLock() {
            const operationLocked = app.isRegularOperationActive();
            const assessmentBlocked = operationLocked || app.isRegularAssessmentUnavailable();
            const slotSelect = document.getElementById('slotSelect');
            if (slotSelect) slotSelect.disabled = operationLocked;
            app.setBatchLevelMenuDisabled(assessmentBlocked);

            document.querySelectorAll('#regularStudentDetail .learning-level-fieldset, #regularReviewDrawer .learning-level-fieldset').forEach(fieldset => {
                fieldset.disabled = assessmentBlocked;
            });
            document.querySelectorAll('#regularStudentDetail .regular-note-editor textarea, #regularStudentDetail .comment-edit, #regularReviewDrawer .regular-note-editor textarea, #regularReviewDrawer .comment-edit, .regular-review-comment').forEach(input => {
                input.disabled = assessmentBlocked;
            });
            document.querySelectorAll('#regularStudentDetail [id^="save-note-"], #regularStudentDetail [id^="gen-btn-"], #regularStudentDetail [id^="submit-btn-"], #regularReviewDrawer [id^="save-note-"], #regularReviewDrawer [id^="gen-btn-"], #regularReviewDrawer [id^="submit-btn-"]').forEach(button => {
                button.disabled = assessmentBlocked;
            });
            document.querySelectorAll('.regular-review-row-generate').forEach(button => {
                const studentId = button.dataset.reviewGenerateStudent;
                const status = studentId ? app.getRegularAssessmentStatus(studentId) : null;
                button.disabled = assessmentBlocked || !!status?.loading || !!status?.error;
            });
            document.querySelectorAll('#regularStudentDetail details.quick-template-menu, #regularReviewDrawer details.quick-template-menu').forEach(details => {
                const summary = details.querySelector(':scope > summary');
                details.classList.toggle('is-disabled', assessmentBlocked);
                if (summary) {
                    summary.setAttribute('aria-disabled', String(assessmentBlocked));
                    summary.tabIndex = assessmentBlocked ? -1 : 0;
                    summary.style.pointerEvents = assessmentBlocked ? 'none' : '';
                }
                if (assessmentBlocked) details.removeAttribute('open');
            });
            document.querySelectorAll('#regularStudentDetail details.regular-extra-details').forEach(details => {
                const summary = details.querySelector(':scope > summary');
                if (summary) {
                    summary.setAttribute('aria-disabled', String(assessmentBlocked));
                    summary.tabIndex = assessmentBlocked ? -1 : 0;
                    summary.style.pointerEvents = assessmentBlocked ? 'none' : '';
                }
            });
        }

function updateStats() {
            const total = state.students.length;
            const present = state.students.filter(app.isPresentAttendance).length;
            const mode = app.getCurrentStudentMode();
            const generated = state.students.filter(att => !!state.generatedComments[att.student.id]).length;
            const batchGenerated = state.students.filter(att => app.isPresentAttendance(att) && !!state.generatedComments[att.student.id]).length;
            const submitted = state.students.filter(att => app.hasModeSubmission(att, mode)).length;
            const availableZalo = state.students.filter(att => app.isPresentAttendance(att) && (
                state.generatedComments[att.student.id] || att.commentByAreas?.some(area => area.type === 'CONTENT' && area.content?.trim())
            )).length;

            document.getElementById('statPresent').textContent = present;
            document.getElementById('statGenerated').textContent = generated;
            document.getElementById('statSubmitted').textContent = submitted;
            document.getElementById('statGeneratedItem').style.display = mode === 'demo' ? 'none' : 'flex';
            document.getElementById('statGeneratedLabel').textContent = 'Bản nháp AI';
            document.getElementById('statSubmittedLabel').textContent = mode === 'demo'
                ? 'Đã chấm Demo'
                : mode === 'checkpoint' ? 'Đã chấm' : 'Đã gửi LMS';
            document.getElementById('statsBar').style.display = total > 0 ? 'flex' : 'none';

            if (mode === 'regular') {
                const autoBtn = document.getElementById('autoCommentBtn');
                const submitBtn = document.getElementById('submitAllBtn');
                const copyBtn = document.getElementById('copyZaloBtn');
                const reviewBtn = document.getElementById('reviewAllBtn');
                const batchLevelBtn = document.getElementById('batchLevelBtn');
                const batchLevelLabel = document.getElementById('batchLevelBtnLabel');
                const autoLabel = document.getElementById('autoCommentBtnLabel');
                const submitLabel = document.getElementById('submitAllBtnLabel');
                const copyLabel = document.getElementById('copyZaloBtnLabel');
                const reviewLabel = document.getElementById('reviewAllBtnLabel');
                const hint = document.getElementById('batchActionHint');

                if (autoLabel) autoLabel.textContent = state.regularAssessmentLoad.loading
                    ? 'Đang tải đánh giá...'
                    : `Tạo AI cho ${present} học sinh`;
                if (submitLabel) submitLabel.textContent = `Gửi tất cả (${batchGenerated})`;
                if (copyLabel) copyLabel.textContent = `Sao chép Zalo (${availableZalo})`;
                if (reviewLabel) reviewLabel.textContent = state.regularReviewMode
                    ? 'Đóng review'
                    : `Review cả lớp · ${batchGenerated} bản nháp`;
                if (reviewBtn) reviewBtn.style.display = total > 0 ? 'inline-flex' : 'none';
                if (batchLevelLabel) batchLevelLabel.textContent = state.regularBulkLevelBusy ? 'Đang lưu level...' : `Level cả lớp (${present})`;
                if (batchLevelBtn) batchLevelBtn.setAttribute('aria-busy', String(state.regularBulkLevelBusy));
                if (hint) hint.textContent = state.regularAssessmentLoad.loading
                    ? 'Đang tải mức độ nắm bài và ghi chú đã lưu'
                    : `${present} có mặt · ${generated} bản nháp · ${submitted} đã gửi`;
                const operationLocked = app.isRegularOperationActive();
                const assessmentUnavailable = app.isRegularAssessmentUnavailable();
                if (autoBtn) autoBtn.disabled = operationLocked || assessmentUnavailable || present === 0;
                if (submitBtn) submitBtn.disabled = operationLocked || assessmentUnavailable || batchGenerated === 0;
                if (copyBtn) copyBtn.disabled = operationLocked || availableZalo === 0;
                if (reviewBtn) reviewBtn.disabled = operationLocked || assessmentUnavailable || total === 0;
                app.setBatchLevelMenuDisabled(operationLocked || assessmentUnavailable || present === 0);
            }
            app.syncRegularOperationLock();
        }

async function deleteComment(studentId) {
            if (!state.generatedComments[studentId]) return;
            if (app.getCurrentStudentMode() === 'regular' && app.isRegularOperationActive()) {
                app.showToast('Vui lòng đợi thao tác đang chạy hoàn tất', 'info');
                return;
            }
            if (!(await app.confirmDialog({
                title: 'Xóa bản nháp AI',
                message: 'Xóa bản nháp AI của học sinh này?',
                confirmText: 'Xóa',
                tone: 'danger',
                dangerConfirm: true
            }))) return;
            delete state.generatedComments[studentId];
            delete state.regularOperationErrors[studentId];
            if (state.regularReviewSelectedStudentId === studentId) state.regularReviewSelectedStudentId = null;
            delete state.generatedCommentMeta[studentId];
            app.saveCheckpointScoresToCache();
            app.saveCheckpointDescriptionsToCache();
            app.renderStudents();
            app.updateStats();
            app.showToast('Đã xóa nhận xét');
        }

function updateComment(studentId, value) {
            if (state.generatedComments[studentId]) {
                state.generatedComments[studentId] = `<p>${value}</p>`;
            } else {
                state.manualComments[studentId] = value;
            }
            if (state.regularReviewMode && typeof app.syncRegularReviewComment === 'function') {
                app.syncRegularReviewComment(studentId, value);
            }
        }

function applyTemplate(studentId, templateKey) {
            if (app.isRegularOperationActive() || app.isRegularAssessmentUnavailable()) return;
            const note = app.NOTE_TEMPLATES[templateKey];
            if (typeof note !== 'string') return;
            const input = document.getElementById(`note-${app.getRegularStudentDomId(studentId)}`);
            if (input) input.value = note;
            app.onRegularNoteInput(studentId, note);
            app.showToast('Đã áp dụng mẫu ghi chú');
        }

function showConfirmModal(studentIds = null) {
            if (state.regularBatchBusy) {
                app.showToast('Vui lòng đợi thao tác đang chạy hoàn tất', 'info');
                return;
            }

            const availableIds = Object.keys(state.generatedComments).filter(studentId => {
                const att = state.students.find(item => item.student.id === studentId);
                return att && app.isPresentAttendance(att);
            });
            const requestedIds = Array.isArray(studentIds) ? new Set(studentIds.map(String)) : null;
            const scopeIds = requestedIds ? availableIds.filter(studentId => requestedIds.has(studentId)) : availableIds;
            const comments = scopeIds.map(studentId => [studentId, state.generatedComments[studentId]]);

            if (comments.length === 0) {
                app.showToast('Chưa có nhận xét nào để gửi', 'error');
                return;
            }

            confirmModalReturnFocusElement = document.activeElement;
            state.regularReviewSubmitScopeIds = [...scopeIds];
            const isFilteredScope = requestedIds && scopeIds.length < availableIds.length;
            const title = document.getElementById('confirmModalTitle');
            const description = document.getElementById('confirmModalDescription');
            const submitButton = document.getElementById('confirmSubmitButton');
            if (title) title.textContent = isFilteredScope ? `Gửi ${scopeIds.length} nhận xét đang lọc?` : `Gửi tất cả ${scopeIds.length} nhận xét?`;
            if (description) description.textContent = isFilteredScope
                ? 'Chỉ các học sinh đang nằm trong bộ lọc review tại thời điểm xác nhận sẽ được gửi:'
                : 'Bạn sắp gửi nhận xét lên LMS cho các học sinh sau:';
            if (submitButton) submitButton.textContent = `Gửi ${scopeIds.length} lên LMS`;

            const preview = document.getElementById('confirmPreview');
            preview.innerHTML = comments.map(([studentId, comment]) => {
                const student = state.students.find(s => s.student.id === studentId);
                const cleanComment = comment.replace(/<[^>]*>/g, '').substring(0, 100);
                return `
                    <div class="confirm-preview-item">
                        <div class="confirm-preview-name">${app.escapeHtml(student?.student.fullName || studentId)}</div>
                        <div class="confirm-preview-comment">${app.escapeHtml(cleanComment)}${cleanComment.length >= 100 ? '...' : ''}</div>
                    </div>
                `;
            }).join('');

            document.getElementById('confirmModal').classList.remove('hidden');
            requestAnimationFrame(() => document.getElementById('confirmSubmitButton')?.focus());
        }

function hideConfirmModal(restoreFocus = true) {
            document.getElementById('confirmModal').classList.add('hidden');
            state.regularReviewSubmitScopeIds = null;
            const returnFocus = confirmModalReturnFocusElement;
            confirmModalReturnFocusElement = null;
            if (restoreFocus) restoreDialogFocus(returnFocus);
        }


Object.assign(app, {
    getLocalNote,
    setLocalNote,
    getCurrentStudentMode,
    closeDetailsMenu,
    hasModeSubmission,
    getStudentProgressState,
    configureStudentFilters,
    getVisibleStudents,
    updateStudentCount,
    filterStudents,
    resetStudentFilters,
    refreshClassData,
    exportToCSV,
    showPastComments,
    hidePastCommentsModal,
    getSlotDisplayNumber,
    isPresentAttendance,
    hasAreaType,
    hasContentComment,
    isSlotCompletedForAttendance,
    getSlotCommentProgress,
    findLatestCommentableSlotIndex,
    getClassCommentProgress,
    getClassCommentMeta,
    mergeClassDetailIntoCache,
    autoSelectLatestSlot,
    isRegularOperationActive,
    isRegularAssessmentUnavailable,
    hasDirtyRegularAssessmentDrafts,
    hasUnsavedRegularWork,
    discardRegularWorkState,
    confirmDiscardRegularWork,
    confirmRegularNavigation,
    setBatchLevelMenuDisabled,
    syncRegularOperationLock,
    updateStats,
    deleteComment,
    updateComment,
    applyTemplate,
    showConfirmModal,
    hideConfirmModal
});

app.debouncedFilterStudents = app.debounce(app.filterStudents, 200);
