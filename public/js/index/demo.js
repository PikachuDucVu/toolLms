import { app } from './registry.js';
import { state } from './state.js';

function randomScore75(maxScore) {
            const minScore = Math.ceil(maxScore * 0.75 / 0.25) * 0.25;
            const steps = Math.round((maxScore - minScore) / 0.25) + 1;
            return Math.round((minScore + Math.floor(Math.random() * steps) * 0.25) * 100) / 100;
        }

function randomDemoScores(scoreId) {
            app.getDemoConfig().forEach((cfg, i) => {
                const input = document.getElementById(`dscore-${scoreId}-${i}`);
                if (input) input.value = app.randomScore75(cfg.maxScore);
            });
            app.updateDemoTotal(scoreId);
        }

function cacheDemoInputs(scoreId) {
            const inputs = app.getDemoConfig().map((cfg, i) => document.getElementById(`dscore-${scoreId}-${i}`));
            if (inputs.some(Boolean)) state.demoScoresCache[scoreId] = inputs.map(input => input?.value || '');
            const autoRate = document.getElementById(`autoRate-${scoreId}`);
            if (autoRate) state.demoAutoRateCache[scoreId] = autoRate.checked;
        }

function saveDemoInputsToCache() {
            if (!state.students || !app.isFinalSession()) return;
            state.students.filter(app.isPresentAttendance).forEach(att => {
                app.cacheDemoInputs(att.student.id.replace(/[^a-zA-Z0-9]/g, '_'));
            });
        }

function updateDemoTotal(scoreId) {
            let total = 0;
            const demoConfig = app.getDemoConfig();
            demoConfig.forEach((cfg, i) => {
                const input = document.getElementById(`dscore-${scoreId}-${i}`);
                const val = parseFloat(input?.value) || 0;
                total += val;
                // Update progress bar
                const bar = document.getElementById(`dbar-${scoreId}-${i}`);
                if (bar) bar.style.width = `${Math.min((val / cfg.maxScore * 100), 100).toFixed(0)}%`;
            });
            const totalEl = document.getElementById(`dtotal-${scoreId}`);
            if (totalEl) totalEl.textContent = `${app.formatScore(total)} / ${app.formatScore(app.getDemoMaxTotal(demoConfig))}`;
            app.cacheDemoInputs(scoreId);
        }

function getDemoScores(scoreId) {
            return app.getDemoConfig().map((cfg, i) => {
                const input = document.getElementById(`dscore-${scoreId}-${i}`);
                return {
                    id: cfg.courseProcessDemoDetailId,
                    score: parseFloat(input?.value ?? state.demoScoresCache[scoreId]?.[i]) || 0
                };
            });
        }

async function submitDemoSingle(studentId, attendanceId, scoreId) {
            const summary = document.getElementById('sessionSummary').value;
            if (!summary) {
                app.showToast('Vui lòng nhập tổng kết buổi học', 'error');
                return;
            }

            // Read scores from inputs
            const customScores = app.getDemoScores(scoreId);
            const hasScores = customScores.some(s => s.score > 0);
            if (!hasScores) {
                app.showToast('Vui lòng nhấn "Random >75%" hoặc nhập điểm trước khi submit', 'error');
                return;
            }

            const btn = document.getElementById(`demo-btn-${scoreId}`);
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '⏳ Đang submit...';
            }

            try {
                const baseData = {
                    slot_id: state.selectedSlot._id,
                    class_site_id: state.classData.classSites[0]._id,
                    session_number: 14,
                    class_id: state.classData.id,
                    course_process_id: state.classData.courseProcessId,
                    student_attendance_id: attendanceId,
                    student_id: studentId,
                    comment: '',
                    custom_scores: customScores,
                    summary: `<p>${summary}</p>`,
                    auto_rate: document.getElementById(`autoRate-${scoreId}`)?.checked ?? true
                };

                const built = app.buildFinalDemoPayload(baseData);
                const result = await app.submitToLMS(built.payload);

                if (result.errors) {
                    app.showToast('Lỗi: ' + result.errors[0]?.message, 'error');
                    if (btn) { btn.disabled = false; btn.innerHTML = 'Submit Demo'; }
                    return;
                }

                const studentName = state.students.find(s => s.student.id === studentId)?.student?.fullName || '';
                app.logComment({class_id: state.classData.id, class_name: state.classData.name, session_number: 14, student_id: studentId, student_name: studentName, comment: '', slot_type: 'Final', scores: {total: built.totalDemoScore}, success: true});

                app.showToast(`Demo submitted! Tổng: ${built.totalDemoScore || '?'} điểm`);
                await app.reloadAndRestoreCurrentSlot();
            } catch (e) {
                app.showToast('Lỗi: ' + e.message, 'error');
                if (btn) { btn.disabled = false; btn.innerHTML = 'Submit Demo'; }
            }
        }

async function submitDemoAll() {
            const summary = document.getElementById('sessionSummary').value;
            if (!summary) {
                app.showToast('Vui lòng nhập tổng kết buổi học', 'error');
                return;
            }

            const btn = document.getElementById('submitDemoAllBtn');
            const progressContainer = document.getElementById('progressContainer');
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');

            const toSubmit = state.students.filter(app.isPresentAttendance);
            if (toSubmit.length === 0) {
                app.showToast('Không có học sinh có mặt!', 'error');
                return;
            }

            if (!(await app.confirmDialog({
                title: 'Submit Demo cả lớp',
                message: `Submit Demo cho ${toSubmit.length} học sinh có mặt (điểm random >75%)?`,
                confirmText: `Submit ${toSubmit.length} học sinh`,
                tone: 'warning'
            }))) return;

            btn.disabled = true;
            btn.innerHTML = '⏳ Đang submit...';
            progressContainer.classList.add('show');
            let successCount = 0;
            let summarySubmitted = false;

            for (let i = 0; i < toSubmit.length; i++) {
                const att = toSubmit[i];
                const scoreId = att.student.id.replace(/[^a-zA-Z0-9]/g, '_');
                const progress = Math.round(((i + 1) / toSubmit.length) * 100);
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `Demo ${i + 1}/${toSubmit.length} - ${att.student.fullName}`;

                let customScores = app.getDemoScores(scoreId);
                const hasScores = customScores.some(s => s.score > 0);
                if (!hasScores) {
                    app.randomDemoScores(scoreId);
                    customScores = app.getDemoScores(scoreId);
                }

                try {
                    const baseData = {
                        slot_id: state.selectedSlot._id,
                        class_site_id: state.classData.classSites[0]._id,
                        session_number: 14,
                        class_id: state.classData.id,
                        course_process_id: state.classData.courseProcessId,
                        student_attendance_id: att._id,
                        student_id: att.student.id,
                        comment: '',
                        custom_scores: customScores,
                        auto_rate: document.getElementById(`autoRate-${scoreId}`)?.checked ?? true
                    };

                    if (!summarySubmitted) {
                        baseData.summary = `<p>${summary}</p>`;
                        summarySubmitted = true;
                    }

                    const built = app.buildFinalDemoPayload(baseData);
                    const result = await app.submitToLMS(built.payload);

                    if (!result.errors) {
                        successCount++;
                        app.logComment({class_id: state.classData.id, class_name: state.classData.name, session_number: 14, student_id: att.student.id, student_name: att.student.fullName, comment: '', slot_type: 'Final', scores: {total: built.totalDemoScore}, success: true});
                    }
                } catch (e) {
                    console.error('Demo submit error:', e);
                }
            }

            progressContainer.classList.remove('show');
            btn.innerHTML = 'Submit Demo tất cả (Điểm random >75%)';
            btn.disabled = false;

            if (state.classData && state.classData.id) {
                await app.reloadAndRestoreCurrentSlot();
            }

            app.playSound('success');
            app.showToast(`Đã submit Demo ${successCount}/${toSubmit.length} học sinh!`);
        }


Object.assign(app, {
    randomScore75,
    randomDemoScores,
    cacheDemoInputs,
    saveDemoInputsToCache,
    updateDemoTotal,
    getDemoScores,
    submitDemoSingle,
    submitDemoAll
});
