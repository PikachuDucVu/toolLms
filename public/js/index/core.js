import { app } from './registry.js';
import { state } from './state.js';

async function fetchJSON(url, body) {
            const resp = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            const text = await resp.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(`Server trả về lỗi ${resp.status}`);
            }
            data = await app.maybeDirectAiFallback(url, body, data);
            if (data.error) {
                throw new Error(data.error);
            }
            return data;
        }

function cleanDirectAiResponse(content) {
            const cleaned = app.normalizeDirectAiComment(content);
            return `<p>${app.escapeHtml(cleaned)}</p>`;
        }

function shouldUseDirectAiFallback(data) {
            return !!data?.direct_fallback || (data?.comment && /error code:\s*522|Lỗi AI .*522/.test(data.comment));
        }

async function callDirectAntigravity(model, apiKey, promptOrMessages, thinkingLevel = 'high') {
            if (!apiKey) throw new Error('Vui lòng nhập API Key trong phần Cấu hình');
            const isMessages = Array.isArray(promptOrMessages)
                && promptOrMessages.every(item => item && typeof item === 'object' && item.role && Object.prototype.hasOwnProperty.call(item, 'content'));
            const body = { model, messages: isMessages ? promptOrMessages : [{ role: 'user', content: promptOrMessages }] };
            if (thinkingLevel && thinkingLevel !== 'off') {
                body.reasoning_effort = thinkingLevel;
                body.reasoning = { effort: thinkingLevel };
            }
            const resp = await fetch('https://ai.ducvu.io.vn/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(body)
            });
            const text = await resp.text();
            let payload;
            try {
                payload = JSON.parse(text);
            } catch {
                throw new Error(`AI trả về lỗi ${resp.status}`);
            }
            if (!resp.ok) {
                throw new Error(payload.error || text.slice(0, 120) || `AI lỗi ${resp.status}`);
            }
            const content = payload?.choices?.[0]?.message?.content;
            if (!content) throw new Error('AI không trả về nội dung');
            return content;
        }

function stripDirectCommentMarkup(value) {
            return String(value || '')
                .replace(/^```(?:\w+)?\s*/i, '')
                .replace(/\s*```$/i, '')
                .replace(/<[^>]*>/g, ' ')
                .replace(/^\s*(?:nhận xét|noi dung nhan xet)\s*:\s*/i, '')
                .replace(/^\s*[-–]\s+/, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

function normalizeDirectAiComment(value) {
            let cleaned = app.stripDirectCommentMarkup(value);
            const pairs = [['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’']];
            for (const [start, end] of pairs) {
                if (cleaned.startsWith(start) && cleaned.endsWith(end) && cleaned.length > start.length + end.length) {
                    cleaned = cleaned.slice(start.length, -end.length).trim();
                    break;
                }
            }
            return cleaned;
        }

function normalizeDirectForMatch(value) {
            return app.stripDirectCommentMarkup(value)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/đ/g, 'd')
                .replace(/Đ/g, 'D')
                .toLowerCase();
        }

function countDirectSentences(value) {
            const text = app.stripDirectCommentMarkup(value);
            if (!text) return 0;
            return text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(item => item.trim()).filter(Boolean).length || 0;
        }

function validateDirectComment(value, policy = {}) {
            const plain = app.stripDirectCommentMarkup(value);
            const normalized = app.normalizeDirectForMatch(plain);
            const issues = [];
            const requiredConcepts = policy.requiredConcepts || policy.required_concepts || [];
            const bannedPatterns = policy.bannedPatterns || policy.banned_patterns || [];
            const behaviorPatterns = policy.behaviorPatterns || policy.behavior_patterns || [];
            const allowedBehaviorPatterns = policy.allowedBehaviorPatterns || policy.allowed_behavior_patterns || [];
            const absenceLearningPatterns = policy.absenceLearningPatterns || policy.absence_learning_patterns || [];
            const attendanceStatus = policy.attendanceStatus || policy.attendance_status || 'UNKNOWN';
            const allowHomework = policy.allowHomework ?? policy.allow_homework ?? false;
            const mode = policy.mode || 'quick';
            const minSentences = Number(policy.minSentences ?? policy.min_sentences ?? 1);
            const maxSentences = Number(policy.maxSentences ?? policy.max_sentences ?? 6);

            if (!plain) issues.push('Nhận xét đang trống.');
            if (/```|\*\*|^\s*#{1,6}\s|(?:^|\n)\s*[-*]\s+/m.test(String(value || ''))) issues.push('Nhận xét chứa markdown hoặc danh sách.');
            if (/\b(?:l[1-4]|level)\b/i.test(normalized)) issues.push('Nhận xét làm lộ mã level nội bộ.');
            if (bannedPatterns.some(pattern => new RegExp(pattern, 'i').test(normalized))) issues.push('Nhận xét dùng cụm đánh giá mơ hồ.');

            requiredConcepts.forEach(concept => {
                const matched = (concept.patterns || []).some(pattern => new RegExp(pattern, 'i').test(normalized));
                if (!matched) issues.push(`Thiếu ${concept.label}.`);
            });

            if (!allowHomework && /\bbtvn\b|bai tap ve nha/.test(normalized)) issues.push('Nhận xét nhắc BTVN khi không có dữ kiện.');
            const hasUnsupportedBehavior = behaviorPatterns.some(pattern =>
                new RegExp(pattern, 'i').test(normalized) && !allowedBehaviorPatterns.includes(pattern));
            if (hasUnsupportedBehavior) {
                issues.push('Nhận xét tự suy diễn hành vi hoặc nội quy.');
            }

            if (attendanceStatus === 'ATTENDED' && !/dung gio/.test(normalized)) issues.push('Thiếu thông tin đi học đúng giờ.');
            if (attendanceStatus === 'LATE_ARRIVED' && !/(di hoc|den (lop )?).*(muon|tre)/.test(normalized)) issues.push('Thiếu thông tin đi học muộn.');
            if (attendanceStatus === 'ABSENT_WITH_NOTICE' && !/vang.*co phep/.test(normalized)) issues.push('Thiếu thông tin vắng có phép.');
            if (attendanceStatus === 'ABSENT' && !/vang (hoc|buoi)/.test(normalized)) issues.push('Thiếu thông tin vắng học.');
            if (attendanceStatus === 'UNKNOWN' && /(dung gio|di hoc muon|den lop muon|vang hoc|vang co phep)/.test(normalized)) {
                issues.push('Nhận xét tự suy diễn tình trạng chuyên cần.');
            }
            if (mode === 'absence' && absenceLearningPatterns.some(pattern => new RegExp(pattern, 'i').test(normalized))) {
                issues.push('Nhận xét học sinh vắng không được đánh giá mức độ nắm bài.');
            }

            const sentenceCount = app.countDirectSentences(plain);
            if (sentenceCount < minSentences || sentenceCount > maxSentences) {
                issues.push(`Độ dài chưa phù hợp (${sentenceCount} câu; cần ${minSentences}–${maxSentences} câu).`);
            }
            return { valid: issues.length === 0, issues };
        }

function buildDirectRepairMessages(messages, originalComment, issues) {
            return [
                ...messages,
                { role: 'assistant', content: app.normalizeDirectAiComment(originalComment) || '(không có nội dung)' },
                {
                    role: 'user',
                    content: `Bản nháp trên chưa đạt vì:\n- ${issues.join('\n- ')}\nHãy viết lại toàn bộ nhận xét, sửa đúng các lỗi này, vẫn chỉ dùng dữ kiện ban đầu và chỉ trả về đoạn nhận xét.`
                }
            ];
        }

function buildDirectCheckpointPrompt(body) {
            const studentName = body.student_name || '';
            const shortName = studentName ? studentName.trim().split(/\s+/).pop() : 'em';
            return `Bạn là giáo viên lập trình tại MindX Technology School. Viết nhận xét checkpoint cho học sinh gửi phụ huynh.\n\nHỌC SINH: ${studentName} (gọi: ${shortName})\nMÔ TẢ TÓM TẮT TỪ GIÁO VIÊN: ${body.teacher_description || 'Học sinh hoàn thành bài kiểm tra tốt'}\n\nViết thành một đoạn nhận xét gồm: Điểm mạnh, Điểm cần cải thiện, Lời khuyên. Giọng văn chuyên nghiệp, tích cực, mang tính xây dựng. Không dùng markdown, không bullet list.\n\nCHỈ TRẢ VỀ NỘI DUNG NHẬN XÉT, KHÔNG GIẢI THÍCH.`;
        }

async function maybeDirectAiFallback(url, body, data) {
            if (!app.shouldUseDirectAiFallback(data)) return data;
            const model = body.model_id === '__custom__' ? (body.custom_model_id || 'claude-sonnet-4-6') : (body.model_id || 'claude-sonnet-4-6');
            const apiKey = body.ai_api_key || body.api_key || localStorage.getItem('ai_api_key') || '';
            const thinkingLevel = body.thinking_level || 'high';

            if (data.direct_fallback) {
                const fallback = data.direct_fallback;
                const messages = fallback.messages || [];
                const policy = fallback.validation_policy || fallback.validationPolicy || {};
                const safeComment = fallback.safe_comment || fallback.safeComment || '<p>Không thể tạo nhận xét.</p>';
                let accumulatedIssues = [];
                try {
                    const firstContent = await app.callDirectAntigravity(model, apiKey, messages, thinkingLevel);
                    const firstValidation = app.validateDirectComment(firstContent, policy);
                    if (firstValidation.valid) {
                        return {
                            comment: app.cleanDirectAiResponse(firstContent),
                            generation_meta: { source: 'ai', transport: 'direct' }
                        };
                    }

                    accumulatedIssues = firstValidation.issues;
                    const repairMessages = app.buildDirectRepairMessages(messages, firstContent, firstValidation.issues);
                    const repairedContent = await app.callDirectAntigravity(model, apiKey, repairMessages, thinkingLevel);
                    const repairedValidation = app.validateDirectComment(repairedContent, policy);
                    if (repairedValidation.valid) {
                        return {
                            comment: app.cleanDirectAiResponse(repairedContent),
                            generation_meta: {
                                source: 'ai_repair',
                                transport: 'direct',
                                validation_issues: firstValidation.issues
                            }
                        };
                    }
                    accumulatedIssues = [...new Set([...firstValidation.issues, ...repairedValidation.issues])];
                } catch (error) {
                    accumulatedIssues = [...accumulatedIssues, `Direct AI thất bại: ${error?.message || 'Không xác định'}`];
                }

                return {
                    comment: safeComment,
                    generation_meta: {
                        source: 'safe_template',
                        transport: 'direct',
                        validation_issues: accumulatedIssues
                    }
                };
            }

            if (!url.includes('generate_checkpoint_comment')) return data;
            const prompt = app.buildDirectCheckpointPrompt(body);
            const content = await app.callDirectAntigravity(model, apiKey, prompt, thinkingLevel);
            return { comment: app.cleanDirectAiResponse(content) };
        }

function getPresentStudents() {
            return state.students.filter(app.isPresentAttendance);
        }

function playSound(type = 'success') {
            const urls = {
                success: 'https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae50c.mp3',
                error: 'https://cdn.pixabay.com/audio/2022/10/30/audio_3c6b29072d.mp3'
            };
            const url = urls[type] || urls.success;
            if (!app._audioCache[url]) {
                app._audioCache[url] = new Audio(url);
            }
            app._audioCache[url].currentTime = 0;
            app._audioCache[url].play().catch(() => {});
        }

function clearTokens() {
            state.hasServerSession = false;
            localStorage.removeItem('lms_token');
            localStorage.removeItem('lms_token_expiry');
            localStorage.removeItem('lms_firebase_token');
        }

function isTokenValid() {
            return state.hasServerSession;
        }

async function checkServerSession() {
            const resp = await fetch('/api/auth/me', { credentials: 'same-origin' });
            const data = await resp.json().catch(() => ({}));
            if (resp.status === 401) {
                state.hasServerSession = false;
                return false;
            }
            if (!resp.ok) {
                throw new Error(data.error || `Không thể kiểm tra phiên: ${resp.status}`);
            }
            state.hasServerSession = resp.ok && data.authenticated === true;
            return state.hasServerSession;
        }

function getReturnToPath() {
            const value = new URLSearchParams(window.location.search).get('return_to');
            return value === '/homework' ? value : null;
        }

function showLoginRequired() {
            app.clearTokens();
            app.updateLoginStatus(false);
            app.setConfigVisible(true);
            document.getElementById('password')?.focus();
        }

async function firebaseLogin(email, password) {
            const resp = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'same-origin',
                body: JSON.stringify({email, password})
            });
            const text = await resp.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(`Server trả về lỗi ${resp.status}`);
            }
            if (!data.success) {
                throw new Error(data.error || 'Login failed');
            }
            app.clearTokens();
            state.hasServerSession = true;
            return true;
        }

async function lmsApiCall(operationName, query, variables = {}) {
            const body = { operationName, variables, query };
            const resp = await fetch(app.LMS_GRAPHQL_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            const data = await resp.json().catch(() => ({}));
            if (resp.status === 401 && data.code === 'AUTH_REQUIRED') {
                app.showLoginRequired();
                throw new Error(data.error || 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
            }
            if (!resp.ok) {
                throw new Error(data.error || `API error: ${resp.status}`);
            }
            return data;
        }

function isNewFormatClass() {
            if (!state.selectedClass || !state.selectedClass.startDate) return false;
            try {
                return new Date(state.selectedClass.startDate) >= new Date(app.NEW_CLASS_CUTOFF_DATE);
            } catch(e) { return false; }
        }

function buildDefaultPayload(data) {
            // New format for classes starting from 05/04/2026: only CONTENT area, no RATE areas
            if (app.isNewFormatClass()) {
                const byAreas = [
                    {content: data.comment, commentAreaId: "67b54307f79c7bc326e017ff", type: "CONTENT"}
                ];
                const fullContent = `- Đánh giá chung: ${data.comment}`;

                return {
                    slotId: data.slot_id,
                    classSiteId: data.class_site_id,
                    sessionNumber: data.session_number,
                    classId: data.class_id,
                    courseProcessId: data.course_process_id,
                    slotType: "Default",
                    rank: "N/A",
                    totalScore: null,
                    ...(data.summary ? {summary: data.summary} : {}),
                    studentComment: {
                        studentAttendanceId: data.student_attendance_id,
                        studentId: data.student_id,
                        content: fullContent,
                        byAreas: byAreas
                    }
                };
            }

            // Old format: 7 RATE areas + 1 CONTENT area
            const byAreas = [
                ...app.DEFAULT_RATE_AREAS,
                {content: data.comment, commentAreaId: "67b54307f79c7bc326e017ff", type: "CONTENT"}
            ];

            const contentParts = [];
            for (let i = 0; i < app.DEFAULT_RATE_AREAS.length; i++) {
                contentParts.push(`- [COD]  ${app.AREA_NAMES[i]}: ${app.DEFAULT_RATE_AREAS[i].content}`);
            }
            contentParts.push(`- Đánh giá chung: ${data.comment}`);
            const fullContent = contentParts.join('<br>');

            return {
                slotId: data.slot_id,
                classSiteId: data.class_site_id,
                sessionNumber: data.session_number,
                classId: data.class_id,
                courseProcessId: data.course_process_id,
                slotType: "Default",
                rank: "N/A",
                totalScore: null,
                ...(data.summary ? {summary: data.summary} : {}),
                studentComment: {
                    studentAttendanceId: data.student_attendance_id,
                    studentId: data.student_id,
                    content: fullContent,
                    byAreas: byAreas
                }
            };
        }

function buildCheckpointPayload(data) {
            let theoryScore = data.theory_score;
            let practiceScore = data.practice_score;
            const autoScores = data.auto_scores || false;

            if (autoScores || theoryScore == null) theoryScore = [4, 4.5, 5][Math.floor(Math.random()*3)];
            else theoryScore = parseFloat(theoryScore);
            if (autoScores || practiceScore == null) practiceScore = [4, 4.5, 5][Math.floor(Math.random()*3)];
            else practiceScore = parseFloat(practiceScore);
            theoryScore = Math.max(0, Math.min(5, theoryScore));
            practiceScore = Math.max(0, Math.min(5, practiceScore));

            const numCorrect = Math.max(0, Math.min(10, Math.floor(theoryScore / 0.5)));
            let results = Array(numCorrect).fill(true).concat(Array(10-numCorrect).fill(false));
            for (let i = results.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [results[i],results[j]]=[results[j],results[i]]; }

            const checkpointQuestions = results.map((r,i) => ({
                title: `${i+1}. `, result: r, score: r ? 0.5 : 0, id: app.CHECKPOINT_QUESTION_IDS[i]
            }));

            const totalScore = Math.round((theoryScore + practiceScore) / 2 * 10) / 10;
            const rank = totalScore >= 4.5 ? 'A' : totalScore >= 3.5 ? 'B' : totalScore >= 2.5 ? 'C' : 'D';

            const surveyArea = {grade:0,content:"Chúng tôi rất cảm ơn Quý phụ huynh đã tin tưởng và lựa chọn đăng ký học cho con tại Học viện công nghệ MindX. Để nâng cao chất lượng đào tạo và dịch vụ, xin Quý phụ huynh dành chút thời gian để hoàn thành khảo sát dưới đây.\nhttps://forms.office.com/r/aD9aPGAw2A",commentAreaId:"670777c055bde44038509a1b",type:"RATE"};
            const contentArea = {content: data.comment || '<p>Học sinh hoàn thành bài kiểm tra tốt.</p>', commentAreaId: "67b54307f79c7bc326e017ff", type: "CONTENT"};
            const checkpointArea = {
                checkpoint: {practiceScore, checkpointScore: theoryScore, checkpointQuestions},
                content: `Điểm thực hành: ${practiceScore}\n    <p>Điểm trắc nghiệm: ${theoryScore}</p>`,
                commentAreaId: "668e2f99e71f90e7630d4593", type: "CHECKPOINT"
            };

            const byAreas = [...app.CHECKPOINT_RATE_AREAS, surveyArea, contentArea, checkpointArea];

            // Build HTML content (simplified)
            const theoryItems = checkpointQuestions.map(q => `<li data-list="bullet"><span class="ql-ui"></span><span style="color:rgb(0, 0, 0)">${q.title}: ${q.result ? '0.5 điểm' : '0 điểm'}</span></li>`).join('');
            const fullContent = `<div style="list-style-type:circle"><p><strong style="color:rgb(0, 0, 0)">Điểm lý thuyết</strong><span style="color:rgb(0, 0, 0)">: </span><strong style="color:rgb(226, 80, 65)">${theoryScore} điểm</strong></p><ul>${theoryItems}</ul><p><strong style="color:rgb(0, 0, 0)">Điểm thực hành</strong><span style="color:rgb(0, 0, 0)">: </span><strong style="color:rgb(226, 80, 65)">${practiceScore} điểm</strong></p></div>`;

            return {
                payload: {
                    slotId: data.slot_id, classSiteId: data.class_site_id, sessionNumber: data.session_number,
                    classId: data.class_id, courseProcessId: data.course_process_id,
                    slotType: "CheckPoint", totalScore, rank,
                    ...(data.summary ? {summary: data.summary} : {}),
                    studentComment: {
                        studentAttendanceId: data.student_attendance_id, studentId: data.student_id,
                        content: fullContent, byAreas
                    }
                },
                theoryScore, practiceScore, totalScore, rank
            };
        }

function formatScore(value) {
            const num = Number(value);
            if (!Number.isFinite(num)) return '0';
            return String(Math.round(num * 100) / 100);
        }

function getRankFromScore(score) {
            const num = Number(score) || 0;
            if (num >= 4.5) return 'A';
            if (num >= 4) return 'B';
            if (num >= 2.5) return 'C';
            return 'D';
        }

function getActiveCourseProcess() {
            if (state.classData?.courseProcess) return state.classData.courseProcess;
            const courseProcesses = state.classData?.course?.courseProcesses || state.selectedClass?.course?.courseProcesses || [];
            if (!Array.isArray(courseProcesses) || !courseProcesses.length) return null;
            const targetId = state.classData?.courseProcessId || state.selectedClass?.courseProcessId || state.selectedClass?.course?.courseProcessId;
            return courseProcesses.find(cp => cp?.id === targetId) || courseProcesses[0];
        }

function getFallbackDemoSchema() {
            const haystack = [
                state.classData?.course?.shortName,
                state.selectedClass?.course?.shortName,
                state.classData?.course?.name,
                state.selectedClass?.course?.name,
                state.classData?.name,
                state.selectedClass?.name
            ].filter(Boolean).join(' ').toUpperCase();

            if (haystack.includes('C4K-GA') || /(^|[^A-Z])GA([^A-Z]|$)/.test(haystack)) return app.DEMO_FALLBACKS.GA;
            if (haystack.includes('C4K-GB') || /(^|[^A-Z])GB([^A-Z]|$)/.test(haystack)) return app.DEMO_FALLBACKS.GB;
            if (/(^|[^A-Z])PT[ABI]([^A-Z]|$)/.test(haystack) || haystack.includes('HACKATHON')) return app.DEMO_FALLBACKS.HACKATHON;
            return app.DEMO_FALLBACKS.HACKATHON;
        }

function getDemoScoreConfig() {
            const demoScore = app.getActiveCourseProcess()?.finalSession?.demoScore || null;
            const areas = Array.isArray(demoScore?.commentAreas) ? demoScore.commentAreas : [];
            const area = areas.find(a => Array.isArray(a?.demo) && a.demo.length > 0) || areas[0] || null;
            return {demoScore, area};
        }

function normalizeDemoQuestion(question) {
            const id = question?.courseProcessDemoDetailId || question?.id || '';
            return {
                id,
                courseProcessDemoDetailId: id,
                title: question?.title || '',
                maxScore: Number(question?.maxScore ?? 0) || 0
            };
        }

function getDemoConfig() {
            const {area} = app.getDemoScoreConfig();
            const dynamicQuestions = (area?.demo || []).map(app.normalizeDemoQuestion).filter(q => q.courseProcessDemoDetailId && q.maxScore > 0);
            if (dynamicQuestions.length) return dynamicQuestions;
            return app.getFallbackDemoSchema().questions.map(app.normalizeDemoQuestion);
        }

function getDemoMaxTotal(config = app.getDemoConfig()) {
            return Math.round(config.reduce((sum, q) => sum + (Number(q.maxScore) || 0), 0) * 100) / 100;
        }

function getDemoAreaName() {
            const {area} = app.getDemoScoreConfig();
            return area?.name || app.getFallbackDemoSchema().label;
        }

function getDemoAreaId() {
            const {area} = app.getDemoScoreConfig();
            return area?.id || app.getFallbackDemoSchema().commentAreaId;
        }

function getCourseProcessDemoId() {
            const {demoScore} = app.getDemoScoreConfig();
            return demoScore?.id || app.getFallbackDemoSchema().courseProcessDemoId;
        }

function getDemoAreaGrade() {
            const {area} = app.getDemoScoreConfig();
            const areaName = String(area?.name || app.getFallbackDemoSchema().label || '').toUpperCase();
            const hasHackathonQuestion = app.getDemoConfig().some(q => String(q.title || '').toUpperCase().includes('HACKATHON'));
            if (areaName.includes('HACKATHON') || hasHackathonQuestion) return 0;
            return app.getFallbackDemoSchema().demoGrade ?? null;
        }

function getRateCommentSample(area) {
            const rates = Array.isArray(area?.rates) ? area.rates : [];
            const bestRate = rates.find(rate => Number(rate?.value) === 5) || rates[rates.length - 1];
            return bestRate?.commentSamples?.[0] || '';
        }

function getFinalRateAreas() {
            const finalEvaluations = app.getActiveCourseProcess()?.finalSession?.finalEvaluations || [];
            const dynamicAreas = [];
            let order = 0;

            finalEvaluations.forEach(evaluation => {
                (evaluation?.commentAreas || []).forEach(area => {
                    if (!area?.id || (area.type && area.type !== 'RATE')) return;
                    const content = app.FINAL_RATE_CONTENT_BY_AREA_ID[area.id] || app.getRateCommentSample(area);
                    if (!content) return;
                    dynamicAreas.push({
                        __order: order++,
                        grade: 5,
                        content,
                        commentAreaId: area.id,
                        courseProcessFinalEvaluationTitle: evaluation?.title || '',
                        courseProcessFinalEvaluationId: evaluation?.id || null,
                        demoQuestions: [],
                        type: 'RATE'
                    });
                });
            });

            const source = dynamicAreas.length ? dynamicAreas : app.FINAL_RATE_AREAS.map((area, index) => ({...area, __order: index, demoQuestions: []}));
            return source
                .sort((a, b) => {
                    const ai = app.FINAL_RATE_AREA_ORDER.indexOf(a.commentAreaId);
                    const bi = app.FINAL_RATE_AREA_ORDER.indexOf(b.commentAreaId);
                    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                    return a.__order - b.__order;
                })
                .map(area => {
                    const {__order, ...cleanArea} = area;
                    return cleanArea;
                });
        }

function getFinalAbilityScore(rateAreas) {
            if (!rateAreas.length) return 0;
            const total = rateAreas.reduce((sum, area) => sum + (Number(area.grade) || 0), 0);
            return Math.round((total / rateAreas.length) * 100) / 100;
        }

function calculateFinalTotalScore(demoScore, rateAreas) {
            if (!rateAreas.length) return Math.round((Number(demoScore) || 0) * 10) / 10;
            const abilityScore = app.getFinalAbilityScore(rateAreas);
            return Math.round(((Number(demoScore) || 0) * 0.6 + abilityScore * 0.4) * 10) / 10;
        }

function normalizeRateLine(line) {
            return String(line || '').replace(/^\s*-\s*/, '').trim();
        }

function buildFinalEvaluationHtml(rateAreas) {
            if (!rateAreas.length) return '';
            const groups = [];
            rateAreas.forEach(area => {
                const title = area.courseProcessFinalEvaluationTitle || 'ĐÁNH GIÁ';
                let group = groups.find(item => item.title === title);
                if (!group) {
                    group = {title, areas: []};
                    groups.push(group);
                }
                group.areas.push(area);
            });
            groups.sort((a, b) => {
                const ai = app.FINAL_RATE_TITLE_ORDER.indexOf(a.title);
                const bi = app.FINAL_RATE_TITLE_ORDER.indexOf(b.title);
                if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                return 0;
            });

            const sections = groups.map(group => {
                const areaBlocks = group.areas.map(area => {
                    const items = String(area.content || '')
                        .split(/\n+/)
                        .map(app.normalizeRateLine)
                        .filter(Boolean)
                        .map(line => `<li data-list='bullet' class='ql-indent-2'><span class='ql-ui'></span>${app.escapeHtml(line)}</li>`)
                        .join('');
                    return `<ul><span style="color:rgb(0, 0, 0)">${items}</span></ul>`;
                }).join('');
                return `<li data-list="bullet" style="list-style-type:circle"><span class="ql-ui"></span><strong style="color:rgb(226, 80, 65)">​</strong><strong style="color:rgb(0, 0, 0)">${app.escapeHtml(group.title)}: </strong>${areaBlocks}</li>`;
            }).join('');

            return `<p><strong style="color:rgb(0, 0, 0)">​Điểm năng lực: </strong><strong style="color:rgb(226, 80, 65)">${app.formatScore(app.getFinalAbilityScore(rateAreas))} điểm</strong></p><ul>${sections}</ul>`;
        }

function randomScoreAbove75(maxScore, step=0.25) {
            const minScore = Math.ceil(maxScore * 0.75 / step) * step;
            const possible = [];
            for (let s = Math.min(minScore + step, maxScore); s <= maxScore + 0.001; s += step) possible.push(Math.round(s * 100) / 100);
            if (!possible.length) possible.push(maxScore);
            return possible[Math.floor(Math.random() * possible.length)];
        }

function buildFinalDemoPayload(data) {
            const customScores = data.custom_scores;
            const autoRate = data.auto_rate !== false;
            const demoConfig = app.getDemoConfig();

            const demoQuestions = demoConfig.map((q, i) => {
                const maxScore = Number(q.maxScore) || 0;
                let score;
                if (customScores && i < customScores.length) {
                    score = Math.max(0, Math.min(parseFloat(customScores[i].score || 0), maxScore));
                } else {
                    score = app.randomScoreAbove75(maxScore);
                }
                score = Math.round(score * 100) / 100;
                return {courseProcessDemoDetailId: q.courseProcessDemoDetailId, score, title: q.title, result: false, maxScore};
            });

            const totalDemoScore = Math.round(demoQuestions.reduce((s,q) => s + q.score, 0) * 100) / 100;
            const demoItems = demoQuestions.map(q => `<li>${app.escapeHtml(q.title)}: ${app.formatScore(q.score)} điểm</li>`).join('');
            const demoContent = `<div>
                <p>
                  <strong>${app.escapeHtml(app.getDemoAreaName())}:</strong>
                  <strong style='color: rgb(226, 80, 65)'> ${app.formatScore(totalDemoScore)} điểm</strong>
                </p>
                <ul>
                  ${demoItems}
                </ul>
            </div>`;

            const rateAreas = autoRate ? app.getFinalRateAreas() : [];
            const demoGrade = app.getDemoAreaGrade();
            const demoArea = {
                ...(demoGrade !== null ? {grade: demoGrade} : {}),
                demoQuestions,
                content: demoContent,
                commentAreaId: app.getDemoAreaId(),
                type: "DEMO",
                courseProcessDemoId: app.getCourseProcessDemoId()
            };
            const byAreas = [...rateAreas, demoArea];
            const finalTotalScore = app.calculateFinalTotalScore(totalDemoScore, rateAreas);

            const fullContent = `<div style="list-style-type:circle"><p><strong style="color:rgb(0, 0, 0)">Điểm Demo</strong><span style="color:rgb(0, 0, 0)">: </span><strong style="color:rgb(226, 80, 65)">${app.formatScore(totalDemoScore)} điểm</strong></p><ul><li data-list="bullet"><span class="ql-ui"></span><span style="color:rgb(0, 0, 0)">${demoContent}</span></li></ul>${app.buildFinalEvaluationHtml(rateAreas)}</div>`;

            return {
                payload: {
                    slotId: data.slot_id, classSiteId: data.class_site_id, sessionNumber: data.session_number,
                    classId: data.class_id, courseProcessId: data.course_process_id,
                    slotType: "Final", totalScore: finalTotalScore, rank: app.getRankFromScore(finalTotalScore),
                    ...(data.summary ? {summary: data.summary} : {}),
                    studentComment: {
                        studentAttendanceId: data.student_attendance_id, studentId: data.student_id,
                        content: fullContent, byAreas
                    }
                },
                totalDemoScore, demoQuestions
            };
        }

async function submitToLMS(payload) {
            return await app.lmsApiCall("UpdateSlotComment", app.UPDATE_SLOT_COMMENT_QUERY, {payload});
        }

async function logComment(info) {
            try {
                await fetch('/api/log_comment', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(info)
                });
            } catch(e) {
                console.warn('Failed to log comment:', e);
            }
        }


Object.assign(app, {
    fetchJSON,
    cleanDirectAiResponse,
    shouldUseDirectAiFallback,
    callDirectAntigravity,
    stripDirectCommentMarkup,
    normalizeDirectAiComment,
    normalizeDirectForMatch,
    countDirectSentences,
    validateDirectComment,
    buildDirectRepairMessages,
    buildDirectCheckpointPrompt,
    maybeDirectAiFallback,
    getPresentStudents,
    playSound,
    clearTokens,
    isTokenValid,
    checkServerSession,
    getReturnToPath,
    showLoginRequired,
    firebaseLogin,
    lmsApiCall,
    isNewFormatClass,
    buildDefaultPayload,
    buildCheckpointPayload,
    formatScore,
    getRankFromScore,
    getActiveCourseProcess,
    getFallbackDemoSchema,
    getDemoScoreConfig,
    normalizeDemoQuestion,
    getDemoConfig,
    getDemoMaxTotal,
    getDemoAreaName,
    getDemoAreaId,
    getCourseProcessDemoId,
    getDemoAreaGrade,
    getRateCommentSample,
    getFinalRateAreas,
    getFinalAbilityScore,
    calculateFinalTotalScore,
    normalizeRateLine,
    buildFinalEvaluationHtml,
    randomScoreAbove75,
    buildFinalDemoPayload,
    submitToLMS,
    logComment
});
