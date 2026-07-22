import { app } from './registry.js';
import { state } from './state.js';

function getCheckpointRank(theory, practice) {
            if (!theory && !practice) return '';
            const total = ((parseFloat(theory) || 0) + (parseFloat(practice) || 0)) / 2;
            if (total >= 4.5) return 'A';
            if (total >= 3.5) return 'B';
            if (total >= 2.5) return 'C';
            return 'D';
        }

function saveCheckpointScoresToCache() {
            if (!state.students || !app.isCheckpointSession()) return;
            state.students.forEach(att => {
                if (!app.isPresentAttendance(att)) return;
                const scoreId = att.student.id.replace(/[^a-zA-Z0-9]/g, '_');
                const theoryEl = document.getElementById(`cp-theory-${scoreId}`);
                const practiceEl = document.getElementById(`cp-practice-${scoreId}`);
                if (theoryEl || practiceEl) {
                    state.checkpointScoresCache[scoreId] = {
                        theory: theoryEl?.value || '',
                        practice: practiceEl?.value || ''
                    };
                }
            });
        }

function saveCheckpointDescriptionsToCache() {
            if (!state.students || !app.isCheckpointSession()) return;
            state.students.filter(app.isPresentAttendance).forEach(att => {
                const scoreId = att.student.id.replace(/[^a-zA-Z0-9]/g, '_');
                const description = document.getElementById(`cp-desc-${scoreId}`);
                if (description) state.checkpointDescriptionDrafts[att.student.id] = description.value;
            });
        }

function updateCheckpointDescriptionDraft(studentId, value) {
            state.checkpointDescriptionDrafts[studentId] = value;
        }

function getCheckpointDescriptionDraft(studentId) {
            return Object.prototype.hasOwnProperty.call(state.checkpointDescriptionDrafts, studentId)
                ? state.checkpointDescriptionDrafts[studentId]
                : app.getLocalNote(studentId);
        }

function updateCheckpointTotal(scoreId) {
            const theoryRaw = document.getElementById(`cp-theory-${scoreId}`)?.value || '';
            const practiceRaw = document.getElementById(`cp-practice-${scoreId}`)?.value || '';
            const hasTheory = theoryRaw.trim() !== '';
            const hasPractice = practiceRaw.trim() !== '';
            const theory = hasTheory ? parseFloat(theoryRaw) : 0;
            const practice = hasPractice ? parseFloat(practiceRaw) : 0;
            const hasCompleteScores = hasTheory && hasPractice;
            const total = hasCompleteScores ? ((theory + practice) / 2).toFixed(1) : '?';
            const rank = hasCompleteScores ? app.getCheckpointRank(theory, practice) : '';

            // Update both the header readout (cp-total/cp-rank) and the body
            // readout (cp-bodytotal/cp-bodyrank) so they stay in sync live.
            [`cp-total-${scoreId}`, `cp-bodytotal-${scoreId}`].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = total;
            });
            [`cp-rank-${scoreId}`, `cp-bodyrank-${scoreId}`].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.textContent = rank;
                    el.className = `checkpoint-rank ${rank}`;
                }
            });

            // Save to cache when user changes score
            state.checkpointScoresCache[scoreId] = {
                theory: document.getElementById(`cp-theory-${scoreId}`)?.value || '',
                practice: document.getElementById(`cp-practice-${scoreId}`)?.value || ''
            };
        }

async function generateCheckpointComment(studentId, studentName, scoreId) {
            const btn = document.getElementById(`cp-gen-btn-${scoreId}`);
            const desc = document.getElementById(`cp-desc-${scoreId}`)?.value ?? app.getCheckpointDescriptionDraft(studentId);

            // Check API key first
            const { aiApiKey } = app.getSelectedModelConfig();
            if (!aiApiKey) {
                app.showToast('Vui lòng nhập API Key trong phần Cấu hình', 'error');
                return;
            }

            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Đang tạo...';
            }

            try {
                const { aiModel, customModelId, thinkingLevel, aiApiKey } = app.getSelectedModelConfig();
                const data = await app.fetchJSON('/api/generate_checkpoint_comment', {
                    student_name: studentName,
                    teacher_description: desc,
                    model_id: aiModel,
                    custom_model_id: customModelId,
                    thinking_level: thinkingLevel,
                    ai_api_key: aiApiKey
                });
                if (data.error) {
                    app.showToast(data.error, 'error');
                    return;
                }

                state.generatedComments[studentId] = data.comment;
                app.saveCheckpointScoresToCache();
                app.saveCheckpointDescriptionsToCache();
                app.renderStudents();
                app.updateStats();
                app.showToast('Đã tạo nhận xét checkpoint!');
            } catch (e) {
                app.showToast('Lỗi tạo nhận xét: ' + e.message, 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'AI nhận xét';
                }
            }
        }

async function autoCheckpointCommentAll() {
            const btn = document.getElementById('autoCheckpointCommentBtn');
            const progressContainer = document.getElementById('progressContainer');
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');

            // Check API key first
            const { aiApiKey } = app.getSelectedModelConfig();
            if (!aiApiKey) {
                app.showToast('Vui lòng nhập API Key trong phần Cấu hình', 'error');
                return;
            }

            const presentCountCp = state.students.filter(app.isPresentAttendance).length;
            if (!(await app.confirmDialog({
                title: 'AI nhận xét Checkpoint cả lớp',
                message: `AI sẽ tạo nhận xét checkpoint cho ${presentCountCp} học sinh có mặt. Tiếp tục?`,
                confirmText: 'Tạo AI',
                tone: 'info'
            }))) return;

            btn.disabled = true;
            progressContainer.classList.add('show');

            const presentStudents = state.students.filter(app.isPresentAttendance);
            app.saveCheckpointScoresToCache();
            app.saveCheckpointDescriptionsToCache();
            const BATCH_SIZE = 3;
            let completed = 0;

            for (let i = 0; i < presentStudents.length; i += BATCH_SIZE) {
                const batch = presentStudents.slice(i, i + BATCH_SIZE);

                const promises = batch.map(async (att) => {
                    const scoreId = att.student.id.replace(/[^a-zA-Z0-9]/g, '_');
                    const desc = document.getElementById(`cp-desc-${scoreId}`)?.value ?? app.getCheckpointDescriptionDraft(att.student.id);

                    try {
                        const { aiModel, customModelId, thinkingLevel, aiApiKey } = app.getSelectedModelConfig();
                        const data = await app.fetchJSON('/api/generate_checkpoint_comment', {
                            student_name: att.student.fullName,
                            teacher_description: desc,
                            model_id: aiModel,
                            custom_model_id: customModelId,
                            thinking_level: thinkingLevel,
                            ai_api_key: aiApiKey
                        });
                        if (!data.error) {
                            state.generatedComments[att.student.id] = data.comment;
                        }
                    } catch (e) {
                        console.error(e);
                    }
                });

                await Promise.all(promises);
                completed += batch.length;

                const progress = Math.round((completed / presentStudents.length) * 100);
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `${progress}% (${completed}/${presentStudents.length})`;
                app.renderStudents();
                app.updateStats();
            }

            btn.disabled = false;
            progressContainer.classList.remove('show');
            app.playSound('success');
            app.showToast(`Đã tạo ${Object.keys(state.generatedComments).length} nhận xét checkpoint!`);
        }

function getCheckpointScoreInput(scoreId) {
            const theoryRaw = document.getElementById(`cp-theory-${scoreId}`)?.value.trim() || '';
            const practiceRaw = document.getElementById(`cp-practice-${scoreId}`)?.value.trim() || '';

            const parseScore = (raw, label) => {
                if (!raw) return null;
                const score = Number(raw);
                if (!Number.isFinite(score) || score < 0 || score > 5) {
                    throw new Error(`${label} phải nằm trong khoảng 0-5`);
                }
                if (Math.abs(score * 2 - Math.round(score * 2)) > 0.0001) {
                    throw new Error(`${label} phải nhập theo bước 0.5`);
                }
                return score;
            };

            return {
                theoryScore: parseScore(theoryRaw, 'Điểm lý thuyết'),
                practiceScore: parseScore(practiceRaw, 'Điểm thực hành'),
                autoScores: !theoryRaw && !practiceRaw
            };
        }

function getCheckpointScoreOnlyComment(att, studentId) {
            const existingContent = att?.commentByAreas?.find(a => a.type === 'CONTENT' && a.content)?.content;
            if (existingContent) return existingContent;
            if (state.generatedComments[studentId]) return state.generatedComments[studentId];
            if (state.manualComments[studentId]) return `<p>${app.escapeHtml(state.manualComments[studentId])}</p>`;

            const commentEl = document.getElementById(`comment-${studentId}`);
            if (commentEl && commentEl.value.trim()) {
                return `<p>${app.escapeHtml(commentEl.value.trim())}</p>`;
            }

            return '<p>Học sinh hoàn thành bài kiểm tra checkpoint.</p>';
        }

async function submitCheckpointScoreSingle(studentId, attendanceId, scoreId) {
            const att = state.students.find(s => s.student.id === studentId);
            if (!att) return;

            let scoreInput;
            try {
                scoreInput = app.getCheckpointScoreInput(scoreId);
            } catch (e) {
                app.showToast(e.message, 'error');
                return;
            }

            const btn = document.getElementById(`cp-score-btn-${scoreId}`);
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = 'Đang submit...';
            }

            try {
                const summary = document.getElementById('sessionSummary').value;
                const sessionNumber = app.getSessionNumberForTargets([5, 9]) || app.getCurrentSessionNumber();
                const baseData = {
                    slot_id: state.selectedSlot._id,
                    class_site_id: state.classData.classSites[0]._id,
                    session_number: sessionNumber,
                    class_id: state.classData.id,
                    course_process_id: state.classData.courseProcessId,
                    student_attendance_id: attendanceId,
                    student_id: studentId,
                    comment: app.getCheckpointScoreOnlyComment(att, studentId),
                    theory_score: scoreInput.theoryScore,
                    practice_score: scoreInput.practiceScore,
                    auto_scores: scoreInput.autoScores,
                    ...(summary ? {summary: `<p>${summary}</p>`} : {})
                };

                const built = app.buildCheckpointPayload(baseData);
                const result = await app.submitToLMS(built.payload);
                if (result.errors) {
                    app.showToast('Lỗi: ' + result.errors[0]?.message, 'error');
                    return;
                }

                app.logComment({class_id: state.classData.id, class_name: state.classData.name, session_number: sessionNumber, student_id: studentId, student_name: att.student.fullName, comment: baseData.comment, slot_type: 'CheckPointScore', scores: {theory: built.theoryScore, practice: built.practiceScore, total: built.totalScore, rank: built.rank}, success: true});
                app.showToast(`Đã submit điểm checkpoint! LT: ${built.theoryScore} | TH: ${built.practiceScore} | Rank: ${built.rank}`);
                await app.reloadAndRestoreCurrentSlot();
            } catch (e) {
                app.showToast('Lỗi: ' + e.message, 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = 'Submit điểm';
                }
            }
        }

async function submitCheckpointSingle(studentId, attendanceId, scoreId) {
            const summary = document.getElementById('sessionSummary').value;
            if (!summary) {
                app.showToast('Vui lòng nhập tổng kết buổi học', 'error');
                return;
            }

            const theory = document.getElementById(`cp-theory-${scoreId}`)?.value;
            const practice = document.getElementById(`cp-practice-${scoreId}`)?.value;
            const sessionNumber = app.getSessionNumberForTargets([5, 9]) || app.getCurrentSessionNumber();
            // Use AI comment first, then manual comment, then fallback to manual textarea value
            let comment = state.generatedComments[studentId] || '';
            if (!comment && state.manualComments[studentId]) {
                comment = `<p>${state.manualComments[studentId]}</p>`;
            }
            if (!comment) {
                // Try reading directly from the textarea
                const commentEl = document.getElementById(`comment-${studentId}`);
                if (commentEl && commentEl.value.trim()) {
                    comment = `<p>${commentEl.value.trim()}</p>`;
                }
            }

            if (!comment) {
                app.showToast('Vui lòng nhập nhận xét hoặc tạo nhận xét AI trước khi submit', 'error');
                return;
            }

            const btn = document.getElementById(`cp-btn-${scoreId}`);
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Đang submit...';
            }

            try {
                const baseData = {
                    slot_id: state.selectedSlot._id,
                    class_site_id: state.classData.classSites[0]._id,
                    session_number: sessionNumber,
                    class_id: state.classData.id,
                    course_process_id: state.classData.courseProcessId,
                    student_attendance_id: attendanceId,
                    student_id: studentId,
                    comment: comment,
                    theory_score: theory ? parseFloat(theory) : null,
                    practice_score: practice ? parseFloat(practice) : null,
                    auto_scores: !theory && !practice,
                    summary: `<p>${summary}</p>`
                };

                const built = app.buildCheckpointPayload(baseData);
                const result = await app.submitToLMS(built.payload);

                if (result.errors) {
                    app.showToast('Lỗi: ' + result.errors[0]?.message, 'error');
                    if (btn) { btn.disabled = false; btn.textContent = 'Submit checkpoint'; }
                    return;
                }

                delete state.generatedComments[studentId];
                delete state.manualComments[studentId];
                const scoreIdForCache = studentId.replace(/[^a-zA-Z0-9]/g, '_');
                delete state.checkpointScoresCache[scoreIdForCache];
                const studentName = state.students.find(s => s.student.id === studentId)?.student?.fullName || '';
                app.logComment({class_id: state.classData.id, class_name: state.classData.name, session_number: sessionNumber, student_id: studentId, student_name: studentName, comment: comment, slot_type: 'CheckPoint', scores: {theory: built.theoryScore, practice: built.practiceScore, total: built.totalScore, rank: built.rank}, success: true});

                app.showToast(`Checkpoint submitted! LT: ${built.theoryScore} | TH: ${built.practiceScore} | Rank: ${built.rank}`);
                await app.reloadAndRestoreCurrentSlot();
            } catch (e) {
                app.showToast('Lỗi: ' + e.message, 'error');
                if (btn) { btn.disabled = false; btn.textContent = 'Submit checkpoint'; }
            }
        }

async function submitCheckpointScoresAll() {
            const btn = document.getElementById('submitCheckpointScoresAllBtn');
            const progressContainer = document.getElementById('progressContainer');
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');
            const toSubmit = state.students.filter(app.isPresentAttendance);

            if (toSubmit.length === 0) {
                app.showToast('Không có học sinh có mặt!', 'error');
                return;
            }

            const prepared = [];
            for (const att of toSubmit) {
                const scoreId = att.student.id.replace(/[^a-zA-Z0-9]/g, '_');
                try {
                    prepared.push({att, scoreId, scoreInput: app.getCheckpointScoreInput(scoreId)});
                } catch (e) {
                    app.showToast(`${att.student.fullName}: ${e.message}`, 'error');
                    return;
                }
            }

            if (!(await app.confirmDialog({
                title: 'Submit điểm Checkpoint cả lớp',
                message: `Submit điểm checkpoint cho ${prepared.length} học sinh?`,
                confirmText: `Submit ${prepared.length} học sinh`,
                tone: 'warning'
            }))) return;

            btn.disabled = true;
            btn.innerHTML = 'Đang submit điểm...';
            progressContainer.classList.add('show');

            let successCount = 0;
            let summarySubmitted = false;
            const summary = document.getElementById('sessionSummary').value;
            const sessionNumber = app.getSessionNumberForTargets([5, 9]) || app.getCurrentSessionNumber();

            try {
                for (let i = 0; i < prepared.length; i++) {
                    const {att, scoreInput} = prepared[i];
                    const progress = Math.round(((i + 1) / prepared.length) * 100);
                    progressFill.style.width = `${progress}%`;
                    progressText.textContent = `Submit điểm ${i + 1}/${prepared.length} - ${att.student.fullName}`;

                    const baseData = {
                        slot_id: state.selectedSlot._id,
                        class_site_id: state.classData.classSites[0]._id,
                        session_number: sessionNumber,
                        class_id: state.classData.id,
                        course_process_id: state.classData.courseProcessId,
                        student_attendance_id: att._id,
                        student_id: att.student.id,
                        comment: app.getCheckpointScoreOnlyComment(att, att.student.id),
                        theory_score: scoreInput.theoryScore,
                        practice_score: scoreInput.practiceScore,
                        auto_scores: scoreInput.autoScores
                    };

                    if (summary && !summarySubmitted) {
                        baseData.summary = `<p>${summary}</p>`;
                        summarySubmitted = true;
                    }

                    try {
                        const built = app.buildCheckpointPayload(baseData);
                        const result = await app.submitToLMS(built.payload);
                        if (!result.errors) {
                            successCount++;
                            app.logComment({class_id: state.classData.id, class_name: state.classData.name, session_number: sessionNumber, student_id: att.student.id, student_name: att.student.fullName, comment: baseData.comment, slot_type: 'CheckPointScore', scores: {theory: built.theoryScore, practice: built.practiceScore, total: built.totalScore, rank: built.rank}, success: true});
                        } else {
                            console.error('Checkpoint score submit error:', result.errors);
                        }
                    } catch (e) {
                        console.error('Checkpoint score submit error:', e);
                    }
                }

                if (state.classData && state.classData.id) {
                    await app.reloadAndRestoreCurrentSlot();
                }

                app.playSound('success');
                app.showToast(`Đã submit điểm Checkpoint ${successCount}/${prepared.length} học sinh!`);
            } finally {
                progressContainer.classList.remove('show');
                btn.innerHTML = 'Submit điểm Checkpoint tất cả';
                btn.disabled = false;
            }
        }

async function submitCheckpointAll() {
            const summary = document.getElementById('sessionSummary').value;
            if (!summary) {
                app.showToast('Vui lòng nhập tổng kết buổi học', 'error');
                return;
            }

            // Check API key (needed for auto-generating comments)
            const { aiApiKey } = app.getSelectedModelConfig();
            if (!aiApiKey) {
                app.showToast('Vui lòng nhập API Key trong phần Cấu hình', 'error');
                return;
            }

            const btn = document.getElementById('submitCheckpointAllBtn');
            const progressContainer = document.getElementById('progressContainer');
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');

            const toSubmit = state.students.filter(app.isPresentAttendance);
            if (toSubmit.length === 0) {
                app.showToast('Không có học sinh có mặt!', 'error');
                return;
            }

            if (!(await app.confirmDialog({
                title: 'Submit Checkpoint đầy đủ cả lớp',
                message: `Submit checkpoint (nhận xét AI + điểm) cho ${toSubmit.length} học sinh có mặt?`,
                confirmText: `Submit ${toSubmit.length} học sinh`,
                tone: 'warning'
            }))) return;

            // Generate AI comments if needed
            const needsComment = toSubmit.filter(s => !state.generatedComments[s.student.id]);
            if (needsComment.length > 0) {
                app.showToast(`Đang tạo nhận xét AI cho ${needsComment.length} học sinh...`, 'info');
                btn.disabled = true;
                progressContainer.classList.add('show');

                const BATCH_SIZE = 3;
                let completed = 0;

                for (let i = 0; i < needsComment.length; i += BATCH_SIZE) {
                    const batch = needsComment.slice(i, i + BATCH_SIZE);
                    const promises = batch.map(async (att) => {
                        const scoreId = att.student.id.replace(/[^a-zA-Z0-9]/g, '_');
                        const desc = document.getElementById(`cp-desc-${scoreId}`)?.value ?? app.getCheckpointDescriptionDraft(att.student.id);
                        try {
                            const { aiModel, customModelId, thinkingLevel, aiApiKey } = app.getSelectedModelConfig();
                            const data = await app.fetchJSON('/api/generate_checkpoint_comment', {
                                student_name: att.student.fullName,
                                teacher_description: desc,
                                model_id: aiModel,
                                custom_model_id: customModelId,
                                thinking_level: thinkingLevel,
                                ai_api_key: aiApiKey
                            });
                            if (!data.error) {
                                state.generatedComments[att.student.id] = data.comment;
                            }
                        } catch (e) { console.error(e); }
                    });
                    await Promise.all(promises);
                    completed += batch.length;
                    const progress = Math.round((completed / needsComment.length) * 50);
                    progressFill.style.width = `${progress}%`;
                    progressText.textContent = `Tạo nhận xét: ${completed}/${needsComment.length}`;
                }
                app.saveCheckpointScoresToCache();
                app.saveCheckpointDescriptionsToCache();
                app.renderStudents();
            }

            btn.disabled = true;
            btn.textContent = 'Đang submit...';
            progressContainer.classList.add('show');
            let successCount = 0;
            let summarySubmitted = false;
            const sessionNumber = app.getSessionNumberForTargets([5, 9]) || app.getCurrentSessionNumber();

            for (let i = 0; i < toSubmit.length; i++) {
                const att = toSubmit[i];
                const scoreId = att.student.id.replace(/[^a-zA-Z0-9]/g, '_');
                const progress = 50 + Math.round(((i + 1) / toSubmit.length) * 50);
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `Checkpoint ${i + 1}/${toSubmit.length} - ${att.student.fullName}`;

                const theory = document.getElementById(`cp-theory-${scoreId}`)?.value;
                const practice = document.getElementById(`cp-practice-${scoreId}`)?.value;
                // Use AI comment, then manual comment, then default
                let comment = state.generatedComments[att.student.id] || '';
                if (!comment && state.manualComments[att.student.id]) {
                    comment = `<p>${state.manualComments[att.student.id]}</p>`;
                }
                if (!comment) {
                    const commentEl = document.getElementById(`comment-${att.student.id}`);
                    if (commentEl && commentEl.value.trim()) {
                        comment = `<p>${commentEl.value.trim()}</p>`;
                    }
                }
                if (!comment) {
                    comment = '<p>Học sinh hoàn thành tốt bài kiểm tra.</p>';
                }

                try {
                    const baseData = {
                        slot_id: state.selectedSlot._id,
                        class_site_id: state.classData.classSites[0]._id,
                        session_number: sessionNumber,
                        class_id: state.classData.id,
                        course_process_id: state.classData.courseProcessId,
                        student_attendance_id: att._id,
                        student_id: att.student.id,
                        comment: comment,
                        theory_score: theory ? parseFloat(theory) : null,
                        practice_score: practice ? parseFloat(practice) : null,
                        auto_scores: !theory && !practice
                    };

                    if (!summarySubmitted) {
                        baseData.summary = `<p>${summary}</p>`;
                        summarySubmitted = true;
                    }

                    const built = app.buildCheckpointPayload(baseData);
                    const result = await app.submitToLMS(built.payload);

                    if (!result.errors) {
                        successCount++;
                        delete state.generatedComments[att.student.id];
                        delete state.manualComments[att.student.id];
                        delete state.checkpointScoresCache[scoreId];
                        app.logComment({class_id: state.classData.id, class_name: state.classData.name, session_number: sessionNumber, student_id: att.student.id, student_name: att.student.fullName, comment: comment, slot_type: 'CheckPoint', scores: {theory: built.theoryScore, practice: built.practiceScore, total: built.totalScore, rank: built.rank}, success: true});
                    }
                } catch (e) {
                    console.error('Checkpoint submit error:', e);
                }
            }

            progressContainer.classList.remove('show');
            btn.textContent = 'Submit Checkpoint đầy đủ (AI + điểm)';
            btn.disabled = false;

            if (state.classData && state.classData.id) {
                await app.reloadAndRestoreCurrentSlot();
            }

            app.playSound('success');
            app.showToast(`Đã submit Checkpoint ${successCount}/${toSubmit.length} học sinh!`);
        }


Object.assign(app, {
    getCheckpointRank,
    saveCheckpointScoresToCache,
    saveCheckpointDescriptionsToCache,
    updateCheckpointDescriptionDraft,
    getCheckpointDescriptionDraft,
    updateCheckpointTotal,
    generateCheckpointComment,
    autoCheckpointCommentAll,
    getCheckpointScoreInput,
    getCheckpointScoreOnlyComment,
    submitCheckpointScoreSingle,
    submitCheckpointSingle,
    submitCheckpointScoresAll,
    submitCheckpointAll
});
