import { app } from './registry.js';
import { state } from './state.js';

async function loadClasses(forceRefresh = false) {
            const loading = document.getElementById('classLoading');
            const list = document.getElementById('classList');

            // Use cache if available
            if (!forceRefresh && state.classesCache) {
                app.renderClassList(state.classesCache);
                return;
            }

            loading.classList.remove('show');
            list.innerHTML = app.listSkeleton(5);

            try {
                const query = `query GetClasses($pageIndex: Int!, $itemsPerPage: Int!) {
                    classes(payload: {
                        pageIndex: $pageIndex,
                        itemsPerPage: $itemsPerPage,
                        orderBy: "createdAt_desc"
                    }) {
                        data {
                            id
                            name
                            status
                            course { id name shortName }
                            classSites { _id name }
                            slots {
                                _id
                                index
                                date
                                summary
                                studentAttendance {
                                    status
                                    commentByAreas { type }
                                }
                            }
                            startDate
                            endDate
                        }
                        pagination { total }
                    }
                }`;

                const result = await app.lmsApiCall("GetClasses", query, {
                    pageIndex: 0, itemsPerPage: 200
                });

                if (result.errors) {
                    app.showToast(result.errors[0]?.message || 'Unknown error', 'error');
                    return;
                }

                const classes = result?.data?.classes?.data || [];
                const now = new Date();
                const twoWeeksAgo = new Date(Date.now() - 14*24*60*60*1000);
                const running = [];
                const recentlyEnded = [];
                for (const cls of classes) {
                    const endDate = cls.endDate ? new Date(cls.endDate) : null;
                    const hasValidEndDate = endDate && !Number.isNaN(endDate.getTime());
                    const endedByDate = hasValidEndDate && endDate < now;

                    if (cls.status === 'RUNNING' && !endedByDate) {
                        running.push(cls);
                    } else if ((cls.status === 'FINISHED' || endedByDate) && hasValidEndDate && endDate >= twoWeeksAgo) {
                        cls.recentlyEnded = true;
                        recentlyEnded.push(cls);
                    }
                }
                recentlyEnded.sort((a,b) => (b.endDate || '').localeCompare(a.endDate || ''));

                state.classesCache = [...running, ...recentlyEnded];
                app.renderClassList(state.classesCache);
            } catch (e) {
                app.showToast('Lỗi tải danh sách lớp: ' + e.message, 'error');
            } finally {
                loading.classList.remove('show');
            }
        }

function renderClassList(classes) {
            const list = document.getElementById('classList');
            list.innerHTML = '';

            if (classes.length === 0) {
                list.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon" aria-hidden="true">
                            <svg class="icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:48px;height:48px;opacity:0.5">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                            </svg>
                        </div>
                        <div class="empty-state-text">Không có lớp nào</div>
                    </div>
                `;
                return;
            }

            const activeClasses = classes.filter(c => !c.recentlyEnded);
            const endedClasses = classes.filter(c => c.recentlyEnded);

            activeClasses.forEach(cls => list.appendChild(app.createClassListItem(cls)));

            if (endedClasses.length > 0) {
                const separator = document.createElement('div');
                separator.style.cssText = 'display:flex;align-items:center;gap:8px;margin:12px 0 8px;color:var(--gray-400);font-size:12px;';
                separator.innerHTML = `
                    <div style="flex:1;height:1px;background:var(--gray-200);"></div>
                    <span>Đã kết thúc gần đây</span>
                    <div style="flex:1;height:1px;background:var(--gray-200);"></div>
                `;
                list.appendChild(separator);
                endedClasses.forEach(cls => list.appendChild(app.createClassListItem(cls, { ended: true })));
            }
        }

function createClassListItem(cls, { ended = false } = {}) {
            const progress = app.getClassCommentProgress(cls);
            const div = document.createElement('div');
            const selected = state.selectedClass?.id === cls.id;
            div.className = [
                'class-item',
                `comment-${progress.state}`,
                ended ? 'recently-ended' : '',
                selected ? 'selected' : ''
            ].filter(Boolean).join(' ');
            div.setAttribute('role', 'option');
            div.setAttribute('aria-selected', selected ? 'true' : 'false');
            div.setAttribute('aria-label', `${cls.name} - ${progress.badgeText}`);

            const endDate = ended && cls.endDate ? new Date(cls.endDate).toLocaleDateString('vi-VN') : '';
            const endedLabel = ended ? ` <span style="font-size:11px;color:var(--gray-400);font-weight:400;">(Đã kết thúc)</span>` : '';
            const courseName = app.escapeHtml(cls.course?.name || '');
            const slotCount = cls.slots?.length || 0;
            const endText = endDate ? ` • Kết thúc: ${endDate}` : '';
            const metaText = app.getClassCommentMeta(progress);

            div.innerHTML = `
                <div class="class-item-header">
                    <h3>${app.escapeHtml(cls.name)}${endedLabel}</h3>
                    <span class="class-status-badge ${progress.state}">${progress.badgeText}</span>
                </div>
                <p>${courseName} • ${slotCount} buổi${endText}</p>
                ${metaText ? `
                    <div class="class-comment-meta">
                        <span class="class-meta-dot ${progress.state}" aria-hidden="true"></span>
                        <span>${metaText}</span>
                    </div>
                ` : ''}
            `;
            div.onclick = () => app.selectClass(cls, div);
            return div;
        }

async function selectClass(cls, element) {
            if (app.isRegularOperationActive()) {
                app.showToast('Vui lòng đợi thao tác đang chạy hoàn tất trước khi đổi lớp', 'info');
                return;
            }
            if (!(await app.confirmDiscardRegularWork())) return;
            const classRequestToken = ++state.classRefreshToken;

            document.querySelectorAll('.class-item').forEach(el => el.classList.remove('selected'));
            element.classList.add('selected');
            state.selectedClass = cls;

            const studentList = document.getElementById('studentList');
            const slotSelect = document.getElementById('slotSelect');
            studentList.innerHTML = app.studentWorkspaceSkeleton(6);
            studentList.setAttribute('aria-busy', 'true');
            slotSelect.disabled = true;

            try {
                const result = await app.lmsApiCall("GetClassById", app.CLASS_DETAIL_QUERY, {id: cls.id});
                if (classRequestToken !== state.classRefreshToken || state.selectedClass?.id !== cls.id) return;
                app.discardRegularWorkState();
                state.selectedSlot = null;
                state.classData = result?.data?.classesById;

                if (!state.classData) {
                    app.showToast('Không thể tải thông tin lớp', 'error');
                    return;
                }

                app.mergeClassDetailIntoCache(state.classData);
                app.prefetchHomeworkData(state.classData.id);

                slotSelect.innerHTML = '<option value="">-- Chọn buổi --</option>';

                state.classData.slots.forEach((slot, idx) => {
                    const date = new Date(slot.date).toLocaleDateString('vi-VN');
                    const opt = document.createElement('option');
                    opt.value = idx;
                    opt.textContent = `Buổi ${app.getSlotDisplayNumber(slot, idx)} - ${date}`;
                    slotSelect.appendChild(opt);
                });

                // Reset student list
                studentList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon" aria-hidden="true">
                            <svg class="icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:48px;height:48px;opacity:0.5">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                            </svg>
                        </div>
                        <div class="empty-state-text">Chọn buổi học để xem học sinh</div>
                    </div>
                `;
                studentList.setAttribute('aria-busy', 'false');
                document.getElementById('studentCount').textContent = '0 học sinh';

                // Clear session summary when switching class
                document.getElementById('sessionSummary').value = '';
                document.getElementById('submitSummaryBtn').disabled = true;

                // Auto select latest uncommented slot
                app.autoSelectLatestSlot();
            } catch (e) {
                if (classRequestToken === state.classRefreshToken && state.selectedClass?.id === cls.id) {
                    app.showToast('Lỗi tải thông tin lớp', 'error');
                    studentList.innerHTML = '<div class="empty-state"><div class="empty-state-text">Không thể tải dữ liệu lớp. Vui lòng thử lại.</div></div>';
                    studentList.setAttribute('aria-busy', 'false');
                }
            } finally {
                if (classRequestToken === state.classRefreshToken) slotSelect.disabled = false;
            }
        }

async function reloadClassData() {
            if (!state.selectedClass) return;
            try {
                const result = await app.lmsApiCall("GetClassById", app.CLASS_DETAIL_QUERY, {id: state.selectedClass.id});
                state.classData = result?.data?.classesById;
                app.mergeClassDetailIntoCache(state.classData);
                if (state.classData?.id) app.prefetchHomeworkData(state.classData.id);

                const slotSelect = document.getElementById('slotSelect');
                slotSelect.innerHTML = '<option value="">-- Chọn buổi --</option>';
                state.classData.slots.forEach((slot, idx) => {
                    const date = new Date(slot.date).toLocaleDateString('vi-VN');
                    const opt = document.createElement('option');
                    opt.value = idx;
                    opt.textContent = `Buổi ${app.getSlotDisplayNumber(slot, idx)} - ${date}`;
                    slotSelect.appendChild(opt);
                });
            } catch (e) {
                app.showToast('Lỗi tải thông tin lớp: ' + e.message, 'error');
            }
        }

async function reloadAndRestoreCurrentSlot() {
            const currentSlotValue = document.getElementById('slotSelect')?.value;
            await app.reloadClassData();
            const slotSelect = document.getElementById('slotSelect');
            if (currentSlotValue !== '' && currentSlotValue != null) {
                slotSelect.value = currentSlotValue;
                app.loadSlotStudents();
            }
        }

function getCurrentSessionNumber() {
            if (!state.selectedSlot) return 0;
            const slotSelectValue = document.getElementById('slotSelect')?.value;
            if (slotSelectValue !== '' && slotSelectValue != null && Number.isFinite(Number(slotSelectValue))) {
                const optionPosition = Number(slotSelectValue) + 1;
                if ([5, 9, 14].includes(optionPosition)) return optionPosition;
            }
            return app.getSlotDisplayNumber(state.selectedSlot, slotSelectValue);
        }

function getSessionNumberForTargets(targets) {
            const sessionNumber = app.getCurrentSessionNumber();
            return targets.includes(sessionNumber) ? sessionNumber : null;
        }

function isFinalSession() {
            return app.getCurrentSessionNumber() === 14;
        }

function isCheckpointSession() {
            return [5, 9].includes(app.getCurrentSessionNumber());
        }

function shouldMentionPreviousHomework(sessionNumber = app.getCurrentSessionNumber()) {
            // Chỉ nhận xét BTVN ở các buổi thường trước checkpoint 2.
            // Bỏ qua buổi 1, buổi 6 (ngay sau checkpoint 1), checkpoint 9 và từ buổi 10 trở đi.
            return [2, 3, 4, 7, 8].includes(Number(sessionNumber));
        }

async function loadHomeworkDataForClass(classId, silent = true) {
            if (!classId) return null;
            if (state.homeworkDataCache[classId]) return state.homeworkDataCache[classId];
            if (state.homeworkDataPromises[classId]) return state.homeworkDataPromises[classId];

            state.homeworkDataPromises[classId] = fetch(`/api/homework/${encodeURIComponent(classId)}`)
                .then(async resp => {
                    if (!resp.ok) throw new Error(`Không thể tải BTVN (${resp.status})`);
                    const data = await resp.json();
                    if (data.error) throw new Error(data.error);
                    state.homeworkDataCache[classId] = {
                        students: Array.isArray(data.students) ? data.students : [],
                        lessons: Array.isArray(data.lessons) ? data.lessons : [],
                        submissions: Array.isArray(data.submissions) ? data.submissions : []
                    };
                    return state.homeworkDataCache[classId];
                })
                .catch(error => {
                    delete state.homeworkDataPromises[classId];
                    if (!silent) app.showToast('Không thể tải dữ liệu BTVN: ' + error.message, 'error');
                    console.warn('Failed to load homework data:', error);
                    return null;
                });

            return state.homeworkDataPromises[classId];
        }

function prefetchHomeworkData(classId) {
            app.loadHomeworkDataForClass(classId, true).catch(() => null);
        }

function normalizeVietnameseText(value) {
            return String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/đ/g, 'd')
                .replace(/Đ/g, 'D')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
        }

function findHomeworkStudent(attendance, homeworkData) {
            const lmsStudent = attendance?.student || {};
            const studentId = String(lmsStudent.id || '');
            const fullName = app.normalizeVietnameseText(lmsStudent.fullName || '');
            const hwStudents = homeworkData?.students || [];

            return hwStudents.find(student => String(student.studentUid || '') === studentId || String(student.id || '') === studentId)
                || hwStudents.find(student => app.normalizeVietnameseText(student.displayName || '') === fullName)
                || null;
        }

function lessonNameLooksLikeSession(lesson, sessionNumber) {
            const name = app.normalizeVietnameseText(lesson?.name || '');
            if (!name) return false;
            const n = String(Number(sessionNumber));
            return new RegExp(`\\b(buoi|bai|lesson|session)\\s*(tap\\s*)?0?${n}\\b`).test(name)
                || new RegExp(`\\b0?${n}\\s*[-:]`).test(name);
        }

function findHomeworkLessonForSession(homeworkData, sessionNumber) {
            const lessons = (homeworkData?.lessons || []).filter(lesson => lesson && lesson.isActive !== false);
            if (!lessons.length) return null;

            const byName = lessons.find(lesson => app.lessonNameLooksLikeSession(lesson, sessionNumber));
            if (byName) return byName;

            const orders = lessons
                .map(lesson => Number(lesson.displayOrder))
                .filter(order => Number.isFinite(order));
            if (orders.length) {
                const minOrder = Math.min(...orders);
                const expectedOrder = minOrder === 0 ? Number(sessionNumber) - 1 : Number(sessionNumber);
                const byExpectedOrder = lessons.find(lesson => Number(lesson.displayOrder) === expectedOrder);
                if (byExpectedOrder) return byExpectedOrder;
            }

            return lessons.find(lesson => Number(lesson.displayOrder) === Number(sessionNumber))
                || lessons.find(lesson => Number(lesson.displayOrder) === Number(sessionNumber) - 1)
                || null;
        }

function isSubmittedHomework(submission) {
            if (!submission) return false;
            const status = String(submission.status || '').toUpperCase();
            const attachments = Array.isArray(submission.content?.attachments) ? submission.content.attachments : [];
            return ['SUBMITTED', 'MARKED', 'GRADED', 'DONE', 'COMPLETED'].includes(status)
                || Boolean(submission.submittedAt)
                || Number(submission.submittedCount || 0) > 0
                || attachments.length > 0;
        }

function findHomeworkSubmission(homeworkData, homeworkStudent, lesson, attendance) {
            const lessonId = String(lesson?.id || '');
            const studentIds = new Set([
                String(homeworkStudent?.studentUid || ''),
                String(homeworkStudent?.id || ''),
                String(attendance?.student?.id || '')
            ].filter(Boolean));

            const candidates = (homeworkData?.submissions || []).filter(submission => {
                return String(submission.lessonId || '') === lessonId && studentIds.has(String(submission.studentUid || ''));
            });
            if (!candidates.length) return null;

            return candidates.sort((a, b) => {
                const aSubmitted = app.isSubmittedHomework(a) ? 1 : 0;
                const bSubmitted = app.isSubmittedHomework(b) ? 1 : 0;
                if (aSubmitted !== bSubmitted) return bSubmitted - aSubmitted;
                return String(b.submittedAt || b.markedAt || '').localeCompare(String(a.submittedAt || a.markedAt || ''));
            })[0];
        }

async function getPreviousHomeworkStatusForStudent(attendance) {
            const sessionNumber = app.getCurrentSessionNumber();
            if (!app.shouldMentionPreviousHomework(sessionNumber)) return null;
            const previousSession = sessionNumber - 1;
            const homeworkData = await app.loadHomeworkDataForClass(state.classData?.id, true);
            if (!homeworkData) return null;

            const lesson = app.findHomeworkLessonForSession(homeworkData, previousSession);
            if (!lesson) return null;

            const homeworkStudent = app.findHomeworkStudent(attendance, homeworkData);
            if (!homeworkStudent) return null;

            const submission = app.findHomeworkSubmission(homeworkData, homeworkStudent, lesson, attendance);
            const submitted = app.isSubmittedHomework(submission);
            return {
                shouldMention: true,
                previous_session: previousSession,
                lesson_id: lesson.id,
                lesson_name: lesson.name || `BTVN buổi ${previousSession}`,
                submitted,
                marked: String(submission?.status || '').toUpperCase() === 'MARKED',
                score: submission?.score ?? null,
                status: submission?.status || (submitted ? 'SUBMITTED' : 'NOT_SUBMITTED')
            };
        }

function getCheckpointNumber() {
            const sessionNum = app.getSessionNumberForTargets([5, 9]) || app.getCurrentSessionNumber();
            return sessionNum === 5 ? 1 : sessionNum === 9 ? 2 : null;
        }

async function loadCheckpointSubmissionStatus() {
            const classId = state.classData?.id;
            const checkpointNum = app.getCheckpointNumber();
            if (!classId || !checkpointNum) return;

            const key = `${classId}:${checkpointNum}`;
            if (state.checkpointStatusKey === key && state.checkpointStatusOriginal !== null) return; // already loaded

            state.checkpointStatusKey = key;
            state.checkpointSubmissionStatus = {};
            state.checkpointStatusOriginal = null;
            state.checkpointStatusMakeup = null;
            state.checkpointBranchSelection = {};
            state.checkpointStatusLoading = true;

            try {
                const url = `${app.KIEMTRA_BASE}/api/public/checkpoint-status?classId=${encodeURIComponent(classId)}&checkpoint=${checkpointNum}`;
                const res = await fetch(url, { mode: 'cors' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();

                // Soft-deleted exams on kiemtra must not appear in grading UI.
                // Prefer server-side filtering; also drop DELETED client-side as a safeguard.
                const isLiveExam = (exam) => exam && String(exam.status || '').toUpperCase() !== 'DELETED';
                state.checkpointStatusOriginal = isLiveExam(data.original) ? data.original : null;
                state.checkpointStatusMakeup = isLiveExam(data.makeup) ? data.makeup : null;

                const liveOriginal = !!state.checkpointStatusOriginal;
                const liveMakeup = !!state.checkpointStatusMakeup;

                (data.students || []).forEach(s => {
                    const original = liveOriginal ? (s.original || null) : null;
                    const makeup = liveMakeup ? (s.makeup || null) : null;
                    if (!original && !makeup) return;

                    state.checkpointSubmissionStatus[s.studentId] = {
                        ...s,
                        original,
                        makeup,
                    };
                    // Default to the most recent submission across both branches.
                    const origAt = original?.submittedAt || '';
                    const makeupAt = makeup?.submittedAt || '';
                    if (makeupAt && (!origAt || makeupAt > origAt)) {
                        state.checkpointBranchSelection[s.studentId] = 'makeup';
                    } else if (origAt) {
                        state.checkpointBranchSelection[s.studentId] = 'original';
                    }
                });
            } catch (err) {
                console.warn('Không thể tải trạng thái nộp bài từ kiemtra:', err);
                state.checkpointStatusOriginal = null;
                state.checkpointStatusMakeup = null;
            } finally {
                state.checkpointStatusLoading = false;
                // Only re-render if we're still on a checkpoint session for this class
                if (app.isCheckpointSession() && state.classData?.id === classId) {
                    app.saveCheckpointScoresToCache();
                    app.saveCheckpointDescriptionsToCache();
                    app.renderStudents();
                }
            }
        }

function setCheckpointBranch(studentId, branch) {
            state.checkpointBranchSelection[studentId] = branch;
            app.saveCheckpointScoresToCache();
            app.saveCheckpointDescriptionsToCache();
            app.renderStudents();
        }

function toggleCheckpointCard(studentId, event) {
            if (event) event.stopPropagation();
            const scoreId = studentId.replace(/[^a-zA-Z0-9]/g, '_');
            const card = document.getElementById(`cp-card-${scoreId}`);
            if (!card) return;
            const nowCollapsed = card.classList.toggle('collapsed');
            if (nowCollapsed) delete state.checkpointExpanded[studentId];
            else state.checkpointExpanded[studentId] = true;
        }

function expandCheckpointCard(studentId) {
            state.checkpointExpanded[studentId] = true;
            const scoreId = studentId.replace(/[^a-zA-Z0-9]/g, '_');
            const card = document.getElementById(`cp-card-${scoreId}`);
            if (card) card.classList.remove('collapsed');
        }

async function loadSlotStudents() {
            const slotIdx = document.getElementById('slotSelect').value;
            if (!slotIdx || !state.classData) return;

            const nextSlot = state.classData.slots[parseInt(slotIdx)];
            const slotChanged = state.regularUiSlotId !== nextSlot?._id;
            if (slotChanged && state.regularUiSlotId && !(await app.confirmDiscardRegularWork())) {
                const previousSlotIndex = state.classData.slots.findIndex(slot => slot._id === state.regularUiSlotId);
                document.getElementById('slotSelect').value = previousSlotIndex >= 0 ? String(previousSlotIndex) : '';
                return;
            }
            state.selectedSlot = nextSlot;
            state.students = state.selectedSlot.studentAttendance || [];
            state.generatedComments = {};
            state.checkpointScoresCache = {};
            state.checkpointDescriptionDrafts = {};
            state.demoScoresCache = {};
            state.demoAutoRateCache = {};
            state.manualComments = {};

            if (slotChanged) {
                state.regularAssessmentContextEpoch += 1;
                state.selectedRegularStudentId = null;
                state.regularNoteDrafts = {};
                state.regularLearningLevelDrafts = {};
                state.regularServerSyncedAssessments = {};
                state.regularInheritedAssessments = {};
                state.regularAssessmentTouched.clear();
                state.regularAssessmentAutoSaveBusy.clear();
                state.regularAssessmentAutoSaveErrors = {};
                state.regularListScrollTop = 0;
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
                document.body.classList.remove('regular-review-active');
            }
            state.regularUiSlotId = state.selectedSlot?._id || null;

            // Set summary if exists, otherwise clear it
            if (state.selectedSlot.summary) {
                document.getElementById('sessionSummary').value = state.selectedSlot.summary.replace(/<[^>]*>/g, '');
            } else {
                document.getElementById('sessionSummary').value = '';
            }

            const isFinal = app.isFinalSession();
            const isCheckpoint = app.isCheckpointSession();
            const isRegular = !isFinal && !isCheckpoint;

            if (isRegular && slotChanged && state.selectedSlot?._id) {
                app.loadRegularAssessments(state.selectedSlot._id);
            } else if (!isRegular) {
                state.regularAssessmentLoad = {
                    slotId: null,
                    token: state.regularAssessmentLoad.token + 1,
                    loading: false,
                    error: null,
                    promise: Promise.resolve()
                };
            }

            // Toggle action bars based on session type
            document.getElementById('defaultActionBar').style.display = isRegular ? 'flex' : 'none';
            document.getElementById('demoActionBar').style.display = isFinal ? 'flex' : 'none';
            document.getElementById('checkpointActionBar').style.display = isCheckpoint ? 'flex' : 'none';

            app.configureStudentFilters();
            app.renderStudents();
            app.updateStats();

            const presentStudents = state.students.filter(app.isPresentAttendance);

            if (isCheckpoint) {
                document.getElementById('submitCheckpointScoresAllBtn').disabled = presentStudents.length === 0;
                document.getElementById('submitCheckpointAllBtn').disabled = presentStudents.length === 0;
                document.getElementById('autoCheckpointCommentBtn').disabled = presentStudents.length === 0;
                // Reset cached status so a class/checkpoint switch reloads fresh data
                state.checkpointStatusKey = null;
                app.loadCheckpointSubmissionStatus();
            } else if (isFinal) {
                // Enable demo submit for all present students (allows re-submit)
                document.getElementById('submitDemoAllBtn').disabled = presentStudents.length === 0;
            }
            document.getElementById('submitSummaryBtn').disabled = false;
        }


Object.assign(app, {
    loadClasses,
    renderClassList,
    createClassListItem,
    selectClass,
    reloadClassData,
    reloadAndRestoreCurrentSlot,
    getCurrentSessionNumber,
    getSessionNumberForTargets,
    isFinalSession,
    isCheckpointSession,
    shouldMentionPreviousHomework,
    loadHomeworkDataForClass,
    prefetchHomeworkData,
    normalizeVietnameseText,
    findHomeworkStudent,
    lessonNameLooksLikeSession,
    findHomeworkLessonForSession,
    isSubmittedHomework,
    findHomeworkSubmission,
    getPreviousHomeworkStatusForStudent,
    getCheckpointNumber,
    loadCheckpointSubmissionStatus,
    setCheckpointBranch,
    toggleCheckpointCard,
    expandCheckpointCard,
    loadSlotStudents
});
