import { app } from './registry.js';
import { state } from './state.js';

function getPastComments(studentId) {
            if (!state.classData) return [];
            
            const pastSlots = [];
            const currentSlotIdx = state.selectedSlot.index;
            
            state.classData.slots.forEach(slot => {
                if (slot.index < currentSlotIdx) {
                    const att = slot.studentAttendance?.find(a => a.student.id === studentId);
                    if (att && att.commentByAreas?.length > 0) {
                        pastSlots.push({
                            index: slot.index + 1,
                            commentByAreas: att.commentByAreas
                        });
                    }
                }
            });
            
            return pastSlots;
        }

async function generateSingle(studentId, studentName, idx) {
            const context = app.captureRegularContext();
            const btn = document.getElementById(`gen-btn-${app.getRegularStudentDomId(studentId)}`);
            const originalButtonHtml = btn?.innerHTML;

            if (!context) return;
            if (app.isRegularOperationActive()) {
                app.showToast('Vui lòng đợi thao tác đang chạy hoàn tất', 'info');
                return;
            }

            const selectedModel = app.getSelectedModelConfig();
            if (!selectedModel.aiApiKey) {
                app.showToast('Vui lòng nhập API Key trong phần Cấu hình', 'error');
                return;
            }

            state.regularStudentBusy.add(studentId);
            delete state.regularOperationErrors[studentId];
            app.syncRegularOperationLock();
            app.updateStats();
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Đang tạo...';
            }

            try {
                await app.ensureRegularAssessmentsLoaded(context);
                await app.waitForRegularAssessmentAutosave(studentId);
                if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');
                const att = state.students.find(s => s.student.id === studentId);
                if (!att) throw new Error('Không tìm thấy học sinh trong buổi học hiện tại');

                const snapshot = app.snapshotRegularStudent(att);
                const requestOptions = {
                    commentLength: document.getElementById('commentLength')?.value || 'medium',
                    customPrompt: document.getElementById('customPrompt')?.value || '',
                    ...selectedModel
                };
                await app.persistStudentAssessment(context, studentId, snapshot.assessment);
                if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');

                const homeworkStatus = await app.getPreviousHomeworkStatusForStudent(att);
                if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');
                const data = await app.fetchJSON('/api/generate_comment', {
                    student_id: snapshot.studentId,
                    student_name: snapshot.studentName || studentName,
                    past_slots: snapshot.pastSlots,
                    session_summary: context.summary,
                    teacher_note: snapshot.assessment.note,
                    learning_level: snapshot.assessment.learningLevel,
                    is_late: snapshot.isLate,
                    homework_status: homeworkStatus,
                    model_id: requestOptions.aiModel,
                    custom_model_id: requestOptions.customModelId,
                    thinking_level: requestOptions.thinkingLevel,
                    comment_length: requestOptions.commentLength,
                    custom_prompt: requestOptions.customPrompt,
                    ai_api_key: requestOptions.aiApiKey
                });
                if (!app.isRegularContextCurrent(context)) return;
                state.generatedComments[studentId] = data.comment;
                delete state.regularOperationErrors[studentId];
                app.showToast('Đã tạo nhận xét!');
            } catch (error) {
                if (app.isRegularContextCurrent(context)) {
                    state.regularOperationErrors[studentId] = error?.message || 'Lỗi không xác định';
                    app.showToast('Lỗi tạo nhận xét: ' + state.regularOperationErrors[studentId], 'error');
                }
            } finally {
                state.regularStudentBusy.delete(studentId);
                app.syncRegularOperationLock();
                if (app.isRegularContextCurrent(context)) {
                    app.renderStudents();
                    if (btn?.isConnected) {
                        btn.disabled = state.regularAssessmentLoad.loading;
                        btn.innerHTML = originalButtonHtml;
                    }
                    app.updateStats();
                }
            }
        }

async function autoCommentAll(studentIds = null) {
            const context = app.captureRegularContext();
            if (!context) return;
            if (app.isRegularOperationActive()) {
                app.showToast('Đang có thao tác nhận xét khác chạy', 'info');
                return;
            }
            const btn = document.getElementById('autoCommentBtn');
            const progressContainer = document.getElementById('progressContainer');
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');
            const requestOptions = {
                commentLength: document.getElementById('commentLength')?.value || 'medium',
                customPrompt: document.getElementById('customPrompt')?.value || '',
                ...app.getSelectedModelConfig()
            };
            if (!requestOptions.aiApiKey) {
                app.showToast('Vui lòng nhập API Key trong phần Cấu hình', 'error');
                return;
            }

            const requestedIds = Array.isArray(studentIds) ? new Set(studentIds.map(String)) : null;
            const targetStudents = state.students.filter(att => app.isPresentAttendance(att)
                && (!requestedIds || requestedIds.has(String(att.student.id))));
            const presentCount = targetStudents.length;
            if (!presentCount) {
                app.showToast('Không có học sinh phù hợp để tạo nhận xét', 'info');
                return;
            }
            if (!(await app.confirmDialog({
                title: requestedIds ? 'Tạo lại nhận xét đang lọc' : 'Tạo nhận xét AI cho cả lớp',
                message: `AI sẽ tạo nhận xét cho ${presentCount} học sinh có mặt${requestedIds ? ' trong bộ lọc hiện tại' : ''}. Tiếp tục?`,
                confirmText: 'Tạo AI',
                tone: 'info'
            }))) return;

            targetStudents.forEach(att => delete state.regularOperationErrors[att.student.id]);
            state.regularBatchBusy = true;
            app.syncRegularOperationLock();
            if (btn) btn.disabled = true;
            progressContainer.classList.add('show');
            app.updateStats();

            let generatedCount = 0;
            const generationFailures = [];
            try {
                await app.ensureRegularAssessmentsLoaded(context);
                if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');
                const presentStudents = targetStudents;
                const snapshots = presentStudents.map(app.snapshotRegularStudent);
                await app.persistRegularStudentSnapshots(context, snapshots, 3);
                if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');

                const BATCH_SIZE = 3;
                let completed = 0;
                const startTime = Date.now();
                for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
                    if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');
                    const batch = snapshots.slice(i, i + BATCH_SIZE);
                    await Promise.all(batch.map(async snapshot => {
                        const att = presentStudents.find(item => item.student.id === snapshot.studentId);
                        try {
                            const homeworkStatus = await app.getPreviousHomeworkStatusForStudent(att);
                            if (!app.isRegularContextCurrent(context)) return;
                            const data = await app.fetchJSON('/api/generate_comment', {
                                student_id: snapshot.studentId,
                                student_name: snapshot.studentName,
                                past_slots: snapshot.pastSlots,
                                session_summary: context.summary,
                                teacher_note: snapshot.assessment.note,
                                learning_level: snapshot.assessment.learningLevel,
                                is_late: snapshot.isLate,
                                homework_status: homeworkStatus,
                                model_id: requestOptions.aiModel,
                                custom_model_id: requestOptions.customModelId,
                                thinking_level: requestOptions.thinkingLevel,
                                comment_length: requestOptions.commentLength,
                                custom_prompt: requestOptions.customPrompt,
                                ai_api_key: requestOptions.aiApiKey
                            });
                            if (!app.isRegularContextCurrent(context)) return;
                            state.generatedComments[snapshot.studentId] = data.comment;
                            delete state.regularOperationErrors[snapshot.studentId];
                            generatedCount++;
                        } catch (error) {
                            const message = error?.message || 'Lỗi không xác định';
                            state.regularOperationErrors[snapshot.studentId] = message;
                            generationFailures.push({
                                studentName: snapshot.studentName,
                                message
                            });
                            console.error('Generate comment error:', snapshot.studentId, error);
                        }
                    }));
                    if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');

                    completed += batch.length;
                    const progress = Math.round((completed / snapshots.length) * 100);
                    progressFill.style.width = `${progress}%`;
                    const elapsed = Date.now() - startTime;
                    const avgTimePerStudent = elapsed / Math.max(completed, 1);
                    const remaining = Math.ceil((snapshots.length - completed) * avgTimePerStudent / 1000);
                    progressText.textContent = `${progress}% (${completed}/${snapshots.length})${remaining > 0 ? ` (~${remaining}s còn lại)` : ''}`;
                    if (app.isRegularContextCurrent(context)) {
                        app.renderStudents();
                        app.updateStats();
                    }
                }
                if (app.isRegularContextCurrent(context)) {
                    const failedCount = generationFailures.length;
                    app.playSound(failedCount ? 'error' : 'success');
                    app.showToast(
                        failedCount
                            ? `Đã tạo ${generatedCount}/${snapshots.length} nhận xét. Lỗi: ${generationFailures.slice(0, 3).map(item => item.studentName).join(', ')}${failedCount > 3 ? '...' : ''}`
                            : `Đã tạo ${generatedCount} nhận xét!`,
                        failedCount ? 'warning' : 'success'
                    );
                }
            } catch (error) {
                if (app.isRegularContextCurrent(context)) {
                    app.showToast('Lỗi tạo nhận xét cả lớp: ' + (error.message || 'Không xác định'), 'error');
                }
            } finally {
                state.regularBatchBusy = false;
                app.syncRegularOperationLock();
                progressContainer.classList.remove('show');
                if (app.isRegularContextCurrent(context)) app.updateStats();
            }
        }

async function submitSingle(studentId, attendanceId) {
            const context = app.captureRegularContext();
            if (!context) return;
            const isFinal = context.sessionNumber === 14;
            const comment = state.generatedComments[studentId];
            if (!isFinal && app.isRegularOperationActive()) {
                app.showToast('Vui lòng đợi thao tác đang chạy hoàn tất', 'info');
                return;
            }
            if (!isFinal && !comment) {
                app.showToast('Chưa có nhận xét để gửi', 'error');
                return;
            }
            if (!context.summary) {
                app.showToast('Vui lòng nhập tổng kết buổi học', 'error');
                return;
            }

            const att = state.students.find(item => item.student.id === studentId);
            if (!att) return;
            let snapshot = null;
            const submitButton = document.getElementById(`submit-btn-${app.getRegularStudentDomId(studentId)}`);
            if (!isFinal) {
                state.regularStudentBusy.add(studentId);
                delete state.regularOperationErrors[studentId];
                app.syncRegularOperationLock();
                app.updateStats();
            }
            if (submitButton) submitButton.disabled = true;

            try {
                if (!isFinal) {
                    await app.ensureRegularAssessmentsLoaded(context);
                    await app.waitForRegularAssessmentAutosave(studentId);
                    if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');
                    snapshot = app.snapshotRegularStudent(att);
                    await app.persistStudentAssessment(context, studentId, snapshot.assessment);
                    if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');
                }

                const baseData = {
                    slot_id: context.slotId,
                    class_site_id: context.classSiteId,
                    session_number: context.sessionNumber,
                    class_id: context.classId,
                    course_process_id: context.courseProcessId,
                    student_attendance_id: attendanceId,
                    student_id: studentId,
                    comment: isFinal ? '' : comment,
                    summary: `<p>${context.summary}</p>`
                };

                let payload, resultInfo = {};
                if (isFinal) {
                    const built = app.buildFinalDemoPayload(baseData);
                    payload = built.payload;
                    resultInfo = {total_demo_score: built.totalDemoScore, demo_scores: built.demoQuestions.reduce((o,q) => ({...o, [q.title.trim()]: q.score}), {})};
                } else {
                    payload = app.buildDefaultPayload(baseData);
                }

                const result = await app.submitToLMS(payload);
                if (result.errors) throw new Error(result.errors[0]?.message || 'Không thể gửi lên LMS');

                app.logComment({
                    class_id: context.classId,
                    class_name: context.className,
                    session_number: context.sessionNumber,
                    student_id: studentId,
                    student_name: snapshot?.studentName || att.student.fullName || '',
                    comment: isFinal ? '' : comment,
                    slot_type: isFinal ? 'Final' : 'Default',
                    learning_level: snapshot?.assessment.learningLevel,
                    scores: resultInfo,
                    success: true
                });

                if (app.isRegularContextCurrent(context)) {
                    const siblingDrafts = isFinal
                        ? {}
                        : Object.fromEntries(Object.entries(state.generatedComments).filter(([id]) => id !== studentId));
                    delete state.generatedComments[studentId];
                    delete state.regularOperationErrors[studentId];
                    if (isFinal && resultInfo.demo_scores) {
                        const scores = Object.entries(resultInfo.demo_scores).map(([k,v]) => `${k}: ${v}`).join(', ');
                        app.showToast(`Đã submit Demo! Tổng: ${resultInfo.total_demo_score} điểm (${scores})`);
                    } else {
                        app.showToast('Đã gửi nhận xét lên LMS!');
                    }
                    if (!isFinal) state.generatedComments = {};
                    await app.reloadAndRestoreCurrentSlot();
                    if (!isFinal && app.isRegularContextCurrent(context)) {
                        Object.assign(state.generatedComments, siblingDrafts);
                        app.renderStudents();
                        app.updateStats();
                    }
                }
            } catch (error) {
                if (app.isRegularContextCurrent(context)) {
                    state.regularOperationErrors[studentId] = error?.message || 'Lỗi không xác định';
                    app.showToast('Lỗi submit: ' + state.regularOperationErrors[studentId], 'error');
                }
                console.error(error);
            } finally {
                if (!isFinal) {
                    state.regularStudentBusy.delete(studentId);
                    app.syncRegularOperationLock();
                }
                if (app.isRegularContextCurrent(context)) {
                    if (state.regularReviewMode) app.renderStudents();
                    app.updateStats();
                    const liveSubmitButton = document.getElementById(`submit-btn-${app.getRegularStudentDomId(studentId)}`);
                    if (liveSubmitButton) liveSubmitButton.disabled = state.regularBatchBusy || state.regularAssessmentLoad.loading;
                }
            }
        }

async function submitSummary() {
            const summary = document.getElementById('sessionSummary').value;
            if (!summary) {
                app.showToast('Vui lòng nhập tổng kết buổi học', 'error');
                return;
            }

            const btn = document.getElementById('submitSummaryBtn');
            btn.disabled = true;
            btn.textContent = '⏳ Đang lưu...';

            try {
                const payload = {
                    slotId: state.selectedSlot._id,
                    classSiteId: state.classData.classSites[0]._id,
                    sessionNumber: app.getCurrentSessionNumber(),
                    classId: state.classData.id,
                    courseProcessId: state.classData.courseProcessId,
                    slotType: "Default",
                    totalScore: null,
                    rank: "",
                    summary: `<p>${summary}</p>`
                };

                const shortQuery = `mutation UpdateSlotComment($payload: UpdateSlotCommentCommand!) {
                    classes { updateSlotComment(payload: $payload) { id name } }
                }`;

                const result = await app.lmsApiCall("UpdateSlotComment", shortQuery, {payload});

                if (result.errors) {
                    app.showToast('Lỗi: ' + result.errors[0]?.message, 'error');
                } else {
                    app.showToast('Đã lưu tổng kết buổi học!');
                }
            } catch (e) {
                app.showToast('Lỗi: ' + e.message, 'error');
                console.error(e);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Lưu tổng kết';
            }
        }

function isMobileDevice() {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                   window.innerWidth <= 768 ||
                   ('ontouchstart' in window);
        }

function showCopyModal(title, text) {
            document.getElementById('copyModalTitle').textContent = title;
            document.getElementById('copyModalTextarea').value = text;
            document.getElementById('copyModal').classList.remove('hidden');
            
            // Auto select text for easy copy
            setTimeout(() => {
                const textarea = document.getElementById('copyModalTextarea');
                textarea.focus();
                textarea.select();
                textarea.setSelectionRange(0, textarea.value.length);
            }, 100);
        }

function hideCopyModal() {
            document.getElementById('copyModal').classList.add('hidden');
        }

function doCopyFromModal() {
            const textarea = document.getElementById('copyModalTextarea');
            const text = textarea.value;
            
            // Try modern clipboard API first
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(() => {
                    app.showToast('Đã copy thành công!');
                    app.hideCopyModal();
                }).catch(() => {
                    app.fallbackCopy(textarea);
                });
            } else {
                app.fallbackCopy(textarea);
            }
        }

function fallbackCopy(textarea) {
            try {
                textarea.focus();
                textarea.select();
                textarea.setSelectionRange(0, textarea.value.length);
                
                const success = document.execCommand('copy');
                if (success) {
                    app.showToast('Đã copy thành công!');
                    app.hideCopyModal();
                } else {
                    app.showToast('Vui lòng bấm giữ để chọn và copy thủ công', 'info');
                }
            } catch (e) {
                app.showToast('Vui lòng bấm giữ để chọn và copy thủ công', 'info');
            }
        }

function smartCopy(text, successMsg) {
            if (app.isMobileDevice()) {
                app.showCopyModal('Copy nhận xét', text);
            } else {
                // Desktop - try clipboard API
                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(text).then(() => {
                        app.showToast(successMsg);
                    }).catch(() => {
                        // Fallback: show modal
                        app.showCopyModal('Copy nhận xét', text);
                    });
                } else {
                    // Fallback for non-secure context
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    textarea.style.position = 'fixed';
                    textarea.style.left = '-9999px';
                    document.body.appendChild(textarea);
                    textarea.select();
                    try {
                        document.execCommand('copy');
                        app.showToast(successMsg);
                    } catch (e) {
                        app.showCopyModal('Copy nhận xét', text);
                    }
                    document.body.removeChild(textarea);
                }
            }
        }

function copyZaloComment(studentName, studentId) {
            studentId = String(studentId || '').trim();
            const att = state.students.find(item => item.student.id === studentId);
            const comment = state.generatedComments[studentId]
                || att?.commentByAreas?.find(area => area.type === 'CONTENT')?.content;
            if (!comment) {
                app.showToast('Chưa có nhận xét', 'error');
                return;
            }
            
            const summary = document.getElementById('sessionSummary').value || 'Thực hành lập trình';
            const cleanComment = comment.replace(/<[^>]*>/g, '').trim();
            
            // Format theo mẫu Zalo
            const zaloText = `📚 NHẬN XÉT BUỔI HỌC

👤 Học sinh: ${studentName}
📖 Nội dung: ${summary}

📝 Nhận xét:
${cleanComment}

---
MindX Technology School`;

            app.smartCopy(zaloText, 'Đã copy nhận xét Zalo!');
        }

function copyAllZalo() {
            const summary = document.getElementById('sessionSummary').value || 'Thực hành lập trình';
            
            // Collect all comments from present students (both AI generated and existing from server)
            const allComments = [];
            const presentStudents = state.students.filter(app.isPresentAttendance);
            
            presentStudents.forEach(student => {
                const studentId = student.student.id;
                const studentName = student.student.fullName;
                
                // Priority: AI generated comment > existing server comment
                let comment = state.generatedComments[studentId];
                if (!comment) {
                    // Check existing comment from server
                    const existingComment = student.commentByAreas?.find(a => a.type === 'CONTENT')?.content;
                    if (existingComment && existingComment.trim().length > 0) {
                        comment = existingComment;
                    }
                }
                
                if (comment && comment.trim().length > 0) {
                    allComments.push({
                        studentId,
                        studentName,
                        comment
                    });
                }
            });
            
            if (allComments.length === 0) {
                app.showToast('Chưa có nhận xét nào', 'error');
                return;
            }
            
            // Get session number and date
            const sessionNumber = app.getCurrentSessionNumber() || 1;
            const slotDate = state.selectedSlot?.date ? new Date(state.selectedSlot.date) : new Date();
            const dateStr = slotDate.toLocaleDateString('vi-VN', {
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric'
            });
            
            // Build the message
            let allText = `Em xin chào quý phụ huynh, em xin phép gửi phần nhận xét sau buổi học số ${sessionNumber} ngày ${dateStr} để các bậc phụ huynh tiện theo dõi và nhắc nhở các bạn học viên ạ:\n\n`;
            
            // Section 1: Lesson content
            allText += `1. Nội dung kiến thức buổi học:\n`;
            allText += `${summary}\n\n`;
            
            // Section 2: Student comments
            allText += `2. Nhận xét tình hình lớp học:\n`;
            
            allComments.forEach(({studentName, comment}) => {
                const cleanComment = comment.replace(/<[^>]*>/g, '').trim();
                // Get short name (first name)
                const shortName = studentName.split(' ').pop();
                allText += `- ${shortName}: ${cleanComment}\n\n`;
            });
            
            // Section 3: Homework / SPCK follow-up
            if (sessionNumber >= 10) {
                allText += `3. Công việc cần hoàn thiện:\n`;
                allText += `- Tiếp tục hoàn thiện sản phẩm cuối khóa theo hướng dẫn của thầy.\n\n`;
            } else {
                allText += `3. BTVN:\n`;
                allText += `- Làm bài tập buổi ${sessionNumber} trên Denise.\n\n`;
            }
            
            // Closing
            allText += `Trên đây là một vài lời nhận xét của em về buổi học vừa rồi. Em xin chúc quý phụ huynh có buổi tối vui vẻ ạ. @All`;
            
            app.smartCopy(allText, `Đã copy ${allComments.length} nhận xét Zalo!`);
        }

async function confirmSubmitAll() {
            const scopeIds = Array.isArray(state.regularReviewSubmitScopeIds)
                ? [...state.regularReviewSubmitScopeIds]
                : null;
            app.hideConfirmModal();
            await app.submitAll(scopeIds);
        }

async function submitAll(studentIds = null) {
            const context = app.captureRegularContext();
            if (!context) return;
            if (app.isRegularOperationActive()) {
                app.showToast('Đang có thao tác nhận xét khác chạy', 'info');
                return;
            }
            const btn = document.getElementById('submitAllBtn');
            const progressContainer = document.getElementById('progressContainer');
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');
            if (!context.summary) {
                app.showToast('Vui lòng nhập tổng kết buổi học', 'error');
                return;
            }

            const requestedIds = Array.isArray(studentIds) ? new Set(studentIds.map(String)) : null;
            const candidateIds = Object.keys(state.generatedComments).filter(studentId => {
                const att = state.students.find(item => item.student.id === studentId);
                return att && app.isPresentAttendance(att) && (!requestedIds || requestedIds.has(String(studentId)));
            });
            if (!candidateIds.length) {
                app.showToast('Không có bản nháp phù hợp để gửi', 'info');
                return;
            }
            const candidateIdSet = new Set(candidateIds);
            candidateIds.forEach(studentId => delete state.regularOperationErrors[studentId]);

            state.regularBatchBusy = true;
            app.syncRegularOperationLock();
            if (btn) btn.disabled = true;
            app.updateStats();
            progressContainer.classList.add('show');

            let successCount = 0;
            let failedCount = 0;
            let totalCount = 0;
            let preservedDrafts = {};
            try {
                await app.ensureRegularAssessmentsLoaded(context);
                if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');
                const submissionSnapshots = Object.entries(state.generatedComments).map(([studentId, comment]) => {
                    const att = state.students.find(item => item.student.id === studentId);
                    if (!candidateIdSet.has(studentId) || !att || !app.isPresentAttendance(att)) return null;
                    return { ...app.snapshotRegularStudent(att), comment };
                }).filter(Boolean);
                const submittedStudentIds = new Set(submissionSnapshots.map(snapshot => snapshot.studentId));
                preservedDrafts = Object.fromEntries(
                    Object.entries(state.generatedComments).filter(([studentId]) => !submittedStudentIds.has(studentId))
                );
                totalCount = submissionSnapshots.length;
                await app.persistRegularStudentSnapshots(context, submissionSnapshots, 3);
                if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');

                let summarySubmitted = false;
                for (let i = 0; i < submissionSnapshots.length; i++) {
                    if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');
                    const snapshot = submissionSnapshots[i];
                    try {
                        const baseData = {
                            slot_id: context.slotId,
                            class_site_id: context.classSiteId,
                            session_number: context.sessionNumber,
                            class_id: context.classId,
                            course_process_id: context.courseProcessId,
                            student_attendance_id: snapshot.attendanceId,
                            student_id: snapshot.studentId,
                            comment: snapshot.comment
                        };
                        if (!summarySubmitted) baseData.summary = `<p>${context.summary}</p>`;

                        const result = await app.submitToLMS(app.buildDefaultPayload(baseData));
                        if (result.errors) {
                            failedCount++;
                            state.regularOperationErrors[snapshot.studentId] = result.errors[0]?.message || 'Không thể gửi lên LMS';
                            console.error('Submit error:', snapshot.studentId, result.errors);
                        } else {
                            successCount++;
                            if (baseData.summary) summarySubmitted = true;
                            app.logComment({
                                class_id: context.classId,
                                class_name: context.className,
                                session_number: context.sessionNumber,
                                student_id: snapshot.studentId,
                                student_name: snapshot.studentName,
                                comment: snapshot.comment,
                                slot_type: 'Default',
                                learning_level: snapshot.assessment.learningLevel,
                                success: true
                            });
                            if (app.isRegularContextCurrent(context)) {
                                delete state.generatedComments[snapshot.studentId];
                                delete state.regularOperationErrors[snapshot.studentId];
                            }
                        }
                    } catch (error) {
                        failedCount++;
                        state.regularOperationErrors[snapshot.studentId] = error?.message || 'Lỗi không xác định';
                        console.error('Submit request error:', snapshot.studentId, error);
                    }

                    if (!app.isRegularContextCurrent(context)) throw new Error('Đã chuyển sang lớp hoặc buổi học khác');
                    const progress = Math.round(((i + 1) / Math.max(submissionSnapshots.length, 1)) * 100);
                    progressFill.style.width = `${progress}%`;
                    progressText.textContent = `${progress}% (${i + 1}/${submissionSnapshots.length})`;
                }

                if (app.isRegularContextCurrent(context)) {
                    app.playSound(failedCount ? 'error' : 'success');
                    if (failedCount === 0 && totalCount > 0) {
                        state.generatedComments = {};
                        await app.reloadAndRestoreCurrentSlot();
                        if (app.isRegularContextCurrent(context)) {
                            Object.assign(state.generatedComments, preservedDrafts);
                            app.renderStudents();
                            app.updateStats();
                        }
                    } else {
                        app.renderStudents();
                        app.updateStats();
                    }
                    app.showToast(
                        failedCount
                            ? `Đã gửi ${successCount}/${totalCount}; còn ${failedCount} nhận xét chưa gửi, bản nháp vẫn được giữ lại.`
                            : `Đã gửi ${successCount}/${totalCount} nhận xét lên LMS!`,
                        failedCount ? 'warning' : 'success'
                    );
                }
            } catch (error) {
                if (app.isRegularContextCurrent(context)) {
                    app.showToast('Lỗi gửi nhận xét cả lớp: ' + (error.message || 'Không xác định'), 'error');
                }
            } finally {
                state.regularBatchBusy = false;
                app.syncRegularOperationLock();
                progressContainer.classList.remove('show');
                if (app.isRegularContextCurrent(context)) app.updateStats();
            }
        }


Object.assign(app, {
    getPastComments,
    generateSingle,
    autoCommentAll,
    submitSingle,
    submitSummary,
    isMobileDevice,
    showCopyModal,
    hideCopyModal,
    doCopyFromModal,
    fallbackCopy,
    smartCopy,
    copyZaloComment,
    copyAllZalo,
    confirmSubmitAll,
    submitAll
});
