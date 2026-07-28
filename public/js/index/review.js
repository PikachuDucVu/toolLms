import { app } from './registry.js';
import { state } from './state.js';

const REVIEW_DUPLICATE_MIN_CHARS = 45;
const REVIEW_DUPLICATE_MIN_WORDS = 8;
let regularReviewReturnFocusElement = null;
let regularReviewPendingFocusState = null;

function stripReviewComment(value) {
    if (typeof app.stripHtmlText === 'function' && typeof document !== 'undefined' && typeof document.createElement === 'function') return app.stripHtmlText(value);
    return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeReviewText(value) {
    return stripReviewComment(value)
        .normalize('NFC')
        .toLocaleLowerCase('vi-VN')
        .replace(/[“”"'`()\[\]{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getReviewSignature(comment, studentName = '') {
    const firstSentence = normalizeReviewText(comment).split(/[.!?]+/)[0]?.trim() || '';
    if (!firstSentence) return '';

    const normalizedName = normalizeReviewText(studentName);
    const nameParts = normalizedName.split(' ').filter(Boolean);
    const nameCandidates = [
        normalizedName,
        nameParts.slice(-2).join(' '),
        nameParts.at(-1) || '',
    ].filter(Boolean).sort((left, right) => right.length - left.length);
    let signature = firstSentence;
    const matchingName = nameCandidates.find(name => signature.startsWith(`${name} `));
    if (matchingName) signature = signature.slice(matchingName.length).trim();
    signature = signature.replace(/^(em|con)\s+/, '').trim();

    const wordCount = signature.split(' ').filter(Boolean).length;
    if (signature.length < REVIEW_DUPLICATE_MIN_CHARS || wordCount < REVIEW_DUPLICATE_MIN_WORDS) return '';
    return signature;
}

function buildReviewDuplicateCounts(rows) {
    const groups = new Map();
    rows.forEach(row => {
        if (!row.isDraft) return;
        const signature = getReviewSignature(row.commentText, row.studentName);
        if (!signature) return;
        if (!groups.has(signature)) groups.set(signature, []);
        groups.get(signature).push(row.studentId);
    });

    const counts = {};
    groups.forEach(studentIds => {
        if (studentIds.length < 2) return;
        studentIds.forEach(studentId => {
            counts[studentId] = studentIds.length;
        });
    });
    return counts;
}

function getRegularReviewRows() {
    const baseRows = state.students.map((att, index) => {
        const studentUi = app.getRegularStudentUiState(att);
        const studentId = att.student.id;
        const draftHtml = state.generatedComments[studentId] || '';
        const existingHtml = studentUi.existingComment || '';
        const commentText = stripReviewComment(draftHtml || existingHtml);
        return {
            index,
            att,
            studentId,
            studentName: att.student.fullName || '',
            attendance: studentUi.attendance,
            isPresent: studentUi.isPresent,
            learningLevel: studentUi.learningLevel,
            learningLevelInfo: studentUi.learningLevelInfo,
            assessmentStatus: studentUi.assessmentStatus,
            commentText,
            isDraft: !!draftHtml,
            hasExistingComment: !!existingHtml,
            source: draftHtml ? 'draft' : existingHtml ? 'submitted' : 'missing',
            characterCount: commentText.length,
            operationError: state.regularOperationErrors[studentId] || '',
            busy: state.regularStudentBusy.has(studentId),
        };
    });

    const duplicateCounts = buildReviewDuplicateCounts(baseRows);
    return baseRows.map(row => ({
        ...row,
        duplicateCount: duplicateCounts[row.studentId] || 0,
        hasWarning: !!row.operationError || (duplicateCounts[row.studentId] || 0) > 0,
    }));
}

function filterRegularReviewRows(rows = getRegularReviewRows()) {
    const search = typeof app.normalizeVietnameseText === 'function'
        ? app.normalizeVietnameseText(state.regularReviewSearch || '')
        : normalizeReviewText(state.regularReviewSearch || '');

    const filtered = rows.filter(row => {
        const searchable = typeof app.normalizeVietnameseText === 'function'
            ? app.normalizeVietnameseText(`${row.studentName} ${row.commentText}`)
            : normalizeReviewText(`${row.studentName} ${row.commentText}`);
        const matchesSearch = !search || searchable.includes(search);
        const matchesLevel = state.regularReviewLevelFilter === 'all'
            || row.learningLevel === state.regularReviewLevelFilter;
        const matchesAlert = state.regularReviewAlertFilter === 'all'
            || (state.regularReviewAlertFilter === 'attention' && row.hasWarning)
            || (state.regularReviewAlertFilter === 'duplicate' && row.duplicateCount > 0)
            || (state.regularReviewAlertFilter === 'missing' && row.source === 'missing');
        return matchesSearch && matchesLevel && matchesAlert;
    });

    const levelOrder = { needs_support: 1, needs_prompting: 2, understands_and_asks: 3, independent: 4 };
    return filtered.sort((left, right) => {
        if (state.regularReviewSort === 'level') {
            return (levelOrder[left.learningLevel] || 0) - (levelOrder[right.learningLevel] || 0)
                || left.studentName.localeCompare(right.studentName, 'vi');
        }
        if (state.regularReviewSort === 'warning') {
            return Number(right.hasWarning) - Number(left.hasWarning)
                || right.duplicateCount - left.duplicateCount
                || left.studentName.localeCompare(right.studentName, 'vi');
        }
        if (state.regularReviewSort === 'attendance') {
            return Number(right.isPresent) - Number(left.isPresent)
                || left.studentName.localeCompare(right.studentName, 'vi');
        }
        return left.studentName.localeCompare(right.studentName, 'vi');
    });
}

function getRegularReviewAllDraftIds() {
    return getRegularReviewRows()
        .filter(row => row.isPresent && row.isDraft)
        .map(row => row.studentId);
}

function getRegularReviewFilteredDraftIds() {
    return filterRegularReviewRows()
        .filter(row => row.isPresent && row.isDraft)
        .map(row => row.studentId);
}

function getRegularReviewFilteredPresentIds() {
    return filterRegularReviewRows()
        .filter(row => row.isPresent)
        .map(row => row.studentId);
}

function captureRegularReviewViewState() {
    const scroll = document.querySelector('.regular-review-scroll');
    const drawer = document.getElementById('regularReviewDrawer');
    if (scroll) state.regularReviewScrollTop = scroll.scrollTop;
    if (drawer) state.regularReviewDrawerScrollTop = drawer.scrollTop;
}

function autosizeRegularReviewTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(72, textarea.scrollHeight)}px`;
}

function getRegularReviewWarningText(row) {
    if (row.operationError) return row.operationError;
    if (row.duplicateCount > 0) {
        return `Câu mở đầu tương tự ${row.duplicateCount - 1} nhận xét khác`;
    }
    return '';
}

function buildRegularReviewRow(row) {
    const domId = app.getRegularStudentDomId(row.studentId);
    const studentIdJs = app.escapeInlineJsAttr(row.studentId);
    const studentNameJs = app.escapeInlineJsAttr(row.studentName);
    const commentId = `review-comment-${domId}`;
    const warningText = getRegularReviewWarningText(row);
    const selected = state.regularReviewSelectedStudentId === row.studentId;
    const operationLocked = app.isRegularOperationActive();
    const generateLabel = row.isDraft ? 'Tạo lại' : 'Tạo AI';
    const sourceBadge = row.isDraft
        ? '<span class="badge badge-generated">Bản nháp AI</span>'
        : row.hasExistingComment
            ? '<span class="badge badge-success">Đã có trên LMS</span>'
            : '<span class="badge badge-warning">Chưa có nhận xét</span>';

    return `
        <article class="regular-review-row ${selected ? 'is-selected' : ''} ${warningText ? 'has-warning' : ''} ${!row.isPresent ? 'is-absent' : ''}"
            id="review-row-${domId}" data-student-id="${app.escapeAttr(row.studentId)}" role="listitem">
            <div class="regular-review-student-cell">
                <strong>${app.escapeHtml(row.studentName)}</strong>
                <div class="regular-review-row-meta">
                    <span class="badge ${row.attendance.badgeClass}">${row.attendance.text}</span>
                    ${sourceBadge}
                </div>
            </div>
            <div class="regular-review-level-cell">
                ${row.isPresent ? `
                    <label class="regular-review-level-control" for="review-level-select-${domId}">
                        <span class="sr-only">Đổi mức học của ${app.escapeHtml(row.studentName)}</span>
                        <select class="form-select regular-review-level-select" id="review-level-select-${domId}"
                            data-review-level-student="${app.escapeAttr(row.studentId)}"
                            aria-label="Đổi mức học của ${app.escapeAttr(row.studentName)}"
                            onchange="setRegularReviewLearningLevel('${studentIdJs}', this.value)"
                            ${(operationLocked || row.assessmentStatus.loading || row.assessmentStatus.error) ? 'disabled' : ''}>
                            ${Object.entries(app.LEARNING_LEVELS).map(([value, info]) => `<option value="${value}" ${row.learningLevel === value ? 'selected' : ''}>${info.code} · ${app.escapeHtml(info.shortLabel)}</option>`).join('')}
                        </select>
                    </label>
                ` : `
                    <span class="regular-review-level-unavailable">Không đánh giá học sinh vắng</span>
                `}
                <span class="badge badge-learning-level" id="review-level-badge-${domId}">${row.learningLevelInfo.code} · ${row.learningLevelInfo.shortLabel}</span>
                <small id="review-assessment-status-${domId}">${app.escapeHtml(row.assessmentStatus.text)}</small>
            </div>
            <div class="regular-review-comment-cell">
                ${row.isDraft ? `
                    <label class="sr-only" for="${commentId}">Nhận xét của ${app.escapeHtml(row.studentName)}</label>
                    <textarea id="${commentId}" class="regular-review-comment" rows="3"
                        oninput="updateRegularReviewComment('${studentIdJs}', this)"
                        onkeydown="handleRegularReviewTextareaKeydown(event, '${studentIdJs}')"
                        ${operationLocked ? 'disabled' : ''}>${app.escapeHtml(row.commentText)}</textarea>
                ` : `
                    <div class="regular-review-comment-placeholder ${row.hasExistingComment ? 'has-existing' : ''}">
                        ${row.hasExistingComment
                            ? app.escapeHtml(row.commentText)
                            : row.isPresent ? 'Chưa có bản nháp AI cho học sinh này.' : 'Học sinh vắng, không nằm trong thao tác hàng loạt.'}
                    </div>
                `}
                <div class="regular-review-comment-meta">
                    <span class="regular-review-warning" id="review-warning-${domId}">${warningText ? `Cảnh báo: ${app.escapeHtml(warningText)}` : ''}</span>
                    <span id="review-character-count-${domId}">${row.characterCount} ký tự</span>
                </div>
            </div>
            <div class="regular-review-actions-cell">
                <button type="button" class="btn btn-xs btn-outline" onclick="openRegularReviewDetail('${studentIdJs}')"
                    id="review-detail-btn-${domId}" aria-expanded="${selected}" aria-controls="regularReviewDrawer">
                    Chi tiết
                </button>
                <button type="button" class="btn btn-xs regular-review-row-generate ${row.isDraft ? 'btn-outline' : 'btn-primary'}"
                    id="review-generate-btn-${domId}" data-review-generate-student="${app.escapeAttr(row.studentId)}"
                    onclick="generateSingle('${studentIdJs}', '${studentNameJs}', ${row.index})"
                    ${operationLocked || row.assessmentStatus.loading || row.assessmentStatus.error ? 'disabled' : ''}>
                    ${row.busy ? 'Đang tạo...' : generateLabel}
                </button>
            </div>
        </article>
    `;
}

function buildRegularReviewDrawer(rows) {
    const studentId = state.regularReviewSelectedStudentId;
    if (!studentId) return '';
    const row = rows.find(item => item.studentId === studentId) || getRegularReviewRows().find(item => item.studentId === studentId);
    if (!row) return '';

    const visibleRows = filterRegularReviewRows();
    const position = visibleRows.findIndex(item => item.studentId === studentId);
    const previous = position > 0 ? visibleRows[position - 1] : null;
    const next = position >= 0 && position < visibleRows.length - 1 ? visibleRows[position + 1] : null;
    const previousIdJs = previous ? app.escapeInlineJsAttr(previous.studentId) : '';
    const nextIdJs = next ? app.escapeInlineJsAttr(next.studentId) : '';

    return `
        <aside class="regular-review-drawer" id="regularReviewDrawer" aria-label="Chi tiết học sinh ${app.escapeHtml(row.studentName)}">
            <div class="regular-review-drawer-header">
                <div>
                    <strong>${app.escapeHtml(row.studentName)}</strong>
                    <span>${position >= 0 ? `${position + 1}/${visibleRows.length}` : ''}</span>
                </div>
                <div class="regular-review-drawer-navigation">
                    <button type="button" class="toolbar-icon-button" id="previousRegularReviewStudent" onclick="openRegularReviewDetail('${previousIdJs}')" ${previous ? '' : 'disabled'} aria-label="Học sinh trước">←</button>
                    <button type="button" class="toolbar-icon-button" id="nextRegularReviewStudent" onclick="openRegularReviewDetail('${nextIdJs}')" ${next ? '' : 'disabled'} aria-label="Học sinh tiếp theo">→</button>
                    <button type="button" class="toolbar-icon-button" id="closeRegularReviewDrawer" onclick="closeRegularReviewDetail()" aria-label="Đóng chi tiết">×</button>
                </div>
            </div>
            <div class="regular-review-drawer-body">
                ${app.buildRegularStudentDetail(row.att, row.index)}
            </div>
        </aside>
    `;
}

function getRegularReviewModal() {
    return document.getElementById('regularReviewModal');
}

function getOpenHigherPriorityDialog() {
    return document.querySelector('#appConfirmModal:not(.hidden), #copyModal:not(.hidden), #confirmModal:not(.hidden), #pastCommentsModal:not(.hidden)');
}

function getFocusableElements(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary:not([aria-disabled="true"]), [href], [tabindex]:not([tabindex="-1"])'
    )).filter(element => element.getClientRects().length > 0);
}

function trapFocusWithin(container, event) {
    const focusable = getFocusableElements(container);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
    }
}

function captureRegularReviewFocusState(list) {
    const active = document.activeElement;
    if (!active?.id || !list?.contains(active)) return;
    regularReviewPendingFocusState = {
        id: active.id,
        selectionStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
        selectionEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
    };
}

function restoreRegularReviewFocusState() {
    const focusState = regularReviewPendingFocusState;
    if (!focusState) return;
    const target = document.getElementById(focusState.id);
    if (!target || target.disabled || !getRegularReviewModal()?.contains(target)) return;
    target.focus({ preventScroll: true });
    if (focusState.selectionStart !== null && typeof target.setSelectionRange === 'function') {
        target.setSelectionRange(focusState.selectionStart, focusState.selectionEnd ?? focusState.selectionStart);
    }
    regularReviewPendingFocusState = null;
}

function setRegularReviewBackgroundInert(inert) {
    const background = document.getElementById('studentList');
    if (!background) return;
    background.inert = inert;
    if (inert) background.setAttribute('aria-hidden', 'true');
    else background.removeAttribute('aria-hidden');

    background.querySelectorAll('[id]').forEach(element => {
        if (inert) {
            if (!element.dataset.reviewOriginalId) element.dataset.reviewOriginalId = element.id;
            element.id = `review-background-${element.dataset.reviewOriginalId}`;
        } else if (element.dataset.reviewOriginalId) {
            element.id = element.dataset.reviewOriginalId;
            delete element.dataset.reviewOriginalId;
        }
    });
}

function openRegularReviewModalShell() {
    const modal = getRegularReviewModal();
    if (!modal) return;
    setRegularReviewBackgroundInert(true);
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('regular-review-active');
}

function forceCloseRegularReviewModal(restoreFocus = false) {
    const modal = getRegularReviewModal();
    const content = document.getElementById('regularReviewModalContent');
    modal?.classList.add('hidden');
    modal?.setAttribute('aria-hidden', 'true');
    if (content) content.innerHTML = '';
    regularReviewPendingFocusState = null;
    setRegularReviewBackgroundInert(false);
    document.body.classList.remove('regular-review-active');

    if (restoreFocus) {
        const target = regularReviewReturnFocusElement?.isConnected
            ? regularReviewReturnFocusElement
            : document.getElementById('reviewAllBtn');
        requestAnimationFrame(() => target?.focus());
    }
}

function handleRegularReviewBackdropClick(event) {
    if (event.target === getRegularReviewModal()) app.exitRegularReviewMode();
}

function renderRegularReview(list = document.getElementById('regularReviewModalContent')) {
    if (!state.regularReviewMode || !list) return;
    if (state.regularReviewShouldResetScroll) {
        state.regularReviewScrollTop = 0;
        state.regularReviewDrawerScrollTop = 0;
        state.regularReviewShouldResetScroll = false;
    } else {
        captureRegularReviewViewState();
    }
    document.body.classList.add('regular-review-active');

    const allRows = getRegularReviewRows();
    const rows = filterRegularReviewRows(allRows);
    const allDraftIds = allRows.filter(row => row.isPresent && row.isDraft).map(row => row.studentId);
    const filteredDraftIds = rows.filter(row => row.isPresent && row.isDraft).map(row => row.studentId);
    const filteredPresentIds = rows.filter(row => row.isPresent).map(row => row.studentId);
    const allPresentIds = allRows.filter(row => row.isPresent).map(row => row.studentId);
    const warningCount = allRows.filter(row => row.hasWarning).length;
    const hasDrawer = !!state.regularReviewSelectedStudentId;
    const operationLocked = app.isRegularOperationActive();
    const assessmentUnavailable = app.isRegularAssessmentUnavailable();
    const assessmentBlocked = operationLocked || assessmentUnavailable;

    captureRegularReviewFocusState(list);
    list.classList.add('regular-review-mode');
    list.setAttribute('aria-busy', String(app.isRegularOperationActive()));
    list.innerHTML = `
        <section class="regular-review-workspace ${hasDrawer ? 'has-drawer' : ''}">
            <div class="regular-review-main">
                <div class="regular-review-header">
                    <div class="regular-review-title-block">
                        <button type="button" class="btn btn-sm btn-outline" id="closeRegularReviewModal" onclick="exitRegularReviewMode()" aria-label="Đóng modal review">× Đóng</button>
                        <div>
                            <h3 id="regularReviewModalTitle">Review cả lớp</h3>
                            <p id="regularReviewSummary">${allDraftIds.length} bản nháp · ${warningCount} cần chú ý · ${rows.length}/${allRows.length} đang hiển thị</p>
                        </div>
                    </div>
                    <div class="regular-review-primary-actions">
                        <details class="toolbar-menu regular-review-level-menu ${assessmentBlocked ? 'is-disabled' : ''}">
                            <summary class="btn btn-sm btn-outline" id="regularReviewBulkLevelButton" aria-label="Đổi mức học cho toàn bộ học sinh có mặt" aria-disabled="${assessmentBlocked}" tabindex="${assessmentBlocked ? '-1' : '0'}">Mức cả lớp</summary>
                            <div class="toolbar-menu-popover regular-review-level-popover">
                                <div class="batch-level-menu-title">Áp dụng cho ${allPresentIds.length} học sinh có mặt</div>
                                ${Object.entries(app.LEARNING_LEVELS).map(([value, info]) => `
                                    <button type="button" class="menu-action batch-level-action review-bulk-level-action" data-level-value="${value}"
                                        onclick="closeDetailsMenu(this); setLearningLevelForAll('${value}')" ${assessmentBlocked ? 'disabled' : ''}>
                                        <span class="batch-level-code">${info.code}</span><span>${app.escapeHtml(info.label)}</span>
                                    </button>
                                `).join('')}
                            </div>
                        </details>
                        <button type="button" class="btn btn-sm btn-primary" id="regularReviewGenerateAll" data-regular-review-generate-all onclick="regenerateRegularReviewAll()" ${allPresentIds.length && !assessmentBlocked ? '' : 'disabled'}>Tạo nhận xét tất cả ${allPresentIds.length}</button>
                        <details class="toolbar-menu regular-review-overflow">
                            <summary class="btn btn-sm btn-outline" id="regularReviewMoreActions" aria-label="Mở thêm công cụ review">Thêm</summary>
                            <div class="toolbar-menu-popover">
                                <button type="button" class="menu-action" onclick="closeDetailsMenu(this); refreshClassData()">Làm mới dữ liệu</button>
                                <button type="button" class="menu-action" onclick="closeDetailsMenu(this); exportToCSV()">Xuất file CSV</button>
                            </div>
                        </details>
                        <button type="button" class="btn btn-sm btn-outline" id="regularReviewCopyAll" onclick="copyAllZalo()" ${allDraftIds.length ? '' : 'disabled'}>Sao chép Zalo</button>
                        <button type="button" class="btn btn-sm btn-success" id="regularReviewSubmitAll" onclick="showConfirmModal()" ${allDraftIds.length && !operationLocked ? '' : 'disabled'}>Gửi tất cả ${allDraftIds.length}</button>
                    </div>
                </div>

                <div class="regular-review-toolbar" aria-label="Bộ lọc review nhận xét">
                    <label class="regular-review-search">
                        <span class="sr-only">Tìm học sinh hoặc nội dung nhận xét</span>
                        <input type="search" class="form-input" id="regularReviewSearch" placeholder="Tìm học sinh hoặc nội dung..."
                            value="${app.escapeAttr(state.regularReviewSearch)}" oninput="queueRegularReviewSearch(this.value)">
                    </label>
                    <label><span>Cảnh báo</span><select class="form-select" id="regularReviewAlertFilter" onchange="setRegularReviewFilter('alert', this.value)">
                        <option value="all" ${state.regularReviewAlertFilter === 'all' ? 'selected' : ''}>Tất cả</option>
                        <option value="attention" ${state.regularReviewAlertFilter === 'attention' ? 'selected' : ''}>Cần chú ý</option>
                        <option value="duplicate" ${state.regularReviewAlertFilter === 'duplicate' ? 'selected' : ''}>Nội dung trùng</option>
                        <option value="missing" ${state.regularReviewAlertFilter === 'missing' ? 'selected' : ''}>Chưa có bản nháp</option>
                    </select></label>
                    <label><span>Mức học</span><select class="form-select" id="regularReviewLevelFilter" onchange="setRegularReviewFilter('level', this.value)">
                        <option value="all" ${state.regularReviewLevelFilter === 'all' ? 'selected' : ''}>Tất cả</option>
                        ${Object.entries(app.LEARNING_LEVELS).map(([value, info]) => `<option value="${value}" ${state.regularReviewLevelFilter === value ? 'selected' : ''}>${info.code}</option>`).join('')}
                    </select></label>
                    <label><span>Sắp xếp</span><select class="form-select" id="regularReviewSort" onchange="setRegularReviewFilter('sort', this.value)">
                        <option value="name" ${state.regularReviewSort === 'name' ? 'selected' : ''}>Tên học sinh</option>
                        <option value="warning" ${state.regularReviewSort === 'warning' ? 'selected' : ''}>Cần chú ý trước</option>
                        <option value="level" ${state.regularReviewSort === 'level' ? 'selected' : ''}>Mức L1 → L4</option>
                        <option value="attendance" ${state.regularReviewSort === 'attendance' ? 'selected' : ''}>Có mặt trước</option>
                    </select></label>
                    <div class="regular-review-filter-actions">
                        <button type="button" class="btn btn-sm btn-outline" id="regularReviewGenerateFiltered" onclick="regenerateRegularReviewFiltered()" ${filteredPresentIds.length && !assessmentBlocked ? '' : 'disabled'}>Tạo nhận xét ${filteredPresentIds.length} mục đang lọc</button>
                        <button type="button" class="btn btn-sm btn-outline" id="regularReviewSubmitFiltered" onclick="submitRegularReviewFiltered()" ${filteredDraftIds.length && !app.isRegularOperationActive() ? '' : 'disabled'}>Gửi ${filteredDraftIds.length} mục đang lọc</button>
                    </div>
                </div>

                <div class="regular-review-table-header" role="row">
                    <span>Học sinh</span><span>Mức</span><span>Nhận xét gửi phụ huynh</span><span>Thao tác</span>
                </div>
                <div class="regular-review-scroll" role="list" aria-label="Nhận xét của cả lớp">
                    ${rows.length ? rows.map(buildRegularReviewRow).join('') : `
                        <div class="empty-state regular-review-empty">
                            <div class="empty-state-text">Không có nhận xét phù hợp với bộ lọc.</div>
                            <button type="button" class="btn btn-sm btn-outline" onclick="resetRegularReviewFilters()">Xóa bộ lọc review</button>
                        </div>
                    `}
                </div>
            </div>
            ${buildRegularReviewDrawer(rows)}
        </section>
    `;
    openRegularReviewModalShell();

    requestAnimationFrame(() => {
        const scroll = list.querySelector('.regular-review-scroll');
        if (scroll) scroll.scrollTop = state.regularReviewScrollTop;
        const drawer = document.getElementById('regularReviewDrawer');
        if (drawer) drawer.scrollTop = state.regularReviewDrawerScrollTop;
        list.querySelectorAll('.regular-review-comment').forEach(autosizeRegularReviewTextarea);
        restoreRegularReviewFocusState();
    });
}

function enterRegularReviewMode() {
    if (app.getCurrentStudentMode() !== 'regular') return;
    if (state.students.length === 0) {
        app.showToast('Buổi học chưa có học sinh để review', 'info');
        return;
    }
    regularReviewReturnFocusElement = document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : document.getElementById('reviewAllBtn');
    state.regularReviewMode = true;
    app.renderRegularReview();
    openRegularReviewModalShell();
    app.updateStats();
    requestAnimationFrame(() => {
        const focusTarget = state.regularReviewSelectedStudentId
            ? document.getElementById('closeRegularReviewDrawer')
            : document.getElementById('closeRegularReviewModal');
        focusTarget?.focus();
    });
}

function exitRegularReviewMode() {
    captureRegularReviewViewState();
    state.regularReviewMode = false;
    forceCloseRegularReviewModal(true);
    app.updateStats();
}

function toggleRegularReviewMode() {
    if (state.regularReviewMode) app.exitRegularReviewMode();
    else app.enterRegularReviewMode();
}

function openRegularReviewDetail(studentId) {
    if (!studentId) return;
    const row = getRegularReviewRows().find(item => item.studentId === studentId);
    if (!row) return;
    captureRegularReviewViewState();
    state.regularReviewSelectedStudentId = studentId;
    state.regularReviewDrawerScrollTop = 0;
    app.renderRegularReview();
    requestAnimationFrame(() => document.getElementById('closeRegularReviewDrawer')?.focus());
}

function closeRegularReviewDetail() {
    const studentId = state.regularReviewSelectedStudentId;
    captureRegularReviewViewState();
    state.regularReviewSelectedStudentId = null;
    app.renderRegularReview();
    requestAnimationFrame(() => {
        if (studentId) document.getElementById(`review-detail-btn-${app.getRegularStudentDomId(studentId)}`)?.focus();
    });
}

function setRegularReviewSearch(value) {
    state.regularReviewSearch = value;
    if (!state.regularReviewMode) return;
    state.regularReviewShouldResetScroll = true;
    app.renderRegularReview();
    requestAnimationFrame(() => {
        const input = document.getElementById('regularReviewSearch');
        if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    });
}

const commitRegularReviewSearch = typeof app.debounce === 'function'
    ? app.debounce(value => setRegularReviewSearch(value), 200)
    : value => setRegularReviewSearch(value);

function queueRegularReviewSearch(value) {
    state.regularReviewSearch = value;
    commitRegularReviewSearch(value);
}

function setRegularReviewFilter(type, value) {
    if (type === 'alert') state.regularReviewAlertFilter = value;
    if (type === 'level') state.regularReviewLevelFilter = value;
    if (type === 'sort') state.regularReviewSort = value;
    state.regularReviewShouldResetScroll = true;
    app.renderRegularReview();
}

function resetRegularReviewFilters() {
    state.regularReviewSearch = '';
    state.regularReviewAlertFilter = 'all';
    state.regularReviewLevelFilter = 'all';
    state.regularReviewSort = 'name';
    state.regularReviewShouldResetScroll = true;
    app.renderRegularReview();
}

function refreshRegularReviewWarnings() {
    if (!state.regularReviewMode) return;
    const rows = getRegularReviewRows();
    const visibleRows = filterRegularReviewRows(rows);
    const draftCount = rows.filter(row => row.isPresent && row.isDraft).length;
    const warningCount = rows.filter(row => row.hasWarning).length;
    const summary = document.getElementById('regularReviewSummary');
    if (summary) summary.textContent = `${draftCount} bản nháp · ${warningCount} cần chú ý · ${visibleRows.length}/${rows.length} đang hiển thị`;
    rows.forEach(row => {
        const domId = app.getRegularStudentDomId(row.studentId);
        const warning = getRegularReviewWarningText(row);
        const warningElement = document.getElementById(`review-warning-${domId}`);
        const countElement = document.getElementById(`review-character-count-${domId}`);
        const rowElement = document.getElementById(`review-row-${domId}`);
        if (warningElement) warningElement.textContent = warning ? `Cảnh báo: ${warning}` : '';
        if (countElement) countElement.textContent = `${row.characterCount} ký tự`;
        rowElement?.classList.toggle('has-warning', !!warning);
    });
}

const scheduleRegularReviewWarnings = typeof app.debounce === 'function'
    ? app.debounce(refreshRegularReviewWarnings, 180)
    : refreshRegularReviewWarnings;

function syncRegularReviewComment(studentId, value) {
    if (!state.regularReviewMode) return;
    const textarea = document.getElementById(`review-comment-${app.getRegularStudentDomId(studentId)}`);
    if (textarea && textarea !== document.activeElement && textarea.value !== value) textarea.value = value;
    autosizeRegularReviewTextarea(textarea);
    const count = document.getElementById(`review-character-count-${app.getRegularStudentDomId(studentId)}`);
    if (count) count.textContent = `${String(value || '').length} ký tự`;
    scheduleRegularReviewWarnings();
}

function updateRegularReviewComment(studentId, textarea) {
    app.updateComment(studentId, textarea.value);
    autosizeRegularReviewTextarea(textarea);
}

function setRegularReviewLearningLevel(studentId, learningLevel) {
    if (!Object.prototype.hasOwnProperty.call(app.LEARNING_LEVELS, learningLevel)) return;
    const attendance = state.students.find(item => item.student.id === studentId);
    if (!attendance || !app.isPresentAttendance(attendance)) {
        app.showToast('Chỉ có thể đổi mức học cho học sinh có mặt', 'info');
        return;
    }
    if (app.isRegularOperationActive() || app.isRegularAssessmentUnavailable()) {
        app.showToast('Vui lòng đợi thao tác đang chạy hoàn tất', 'info');
        return;
    }

    app.onRegularLearningLevelChange(studentId, learningLevel);
    if (state.regularReviewMode) app.renderRegularReview();
}

function handleRegularReviewTextareaKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        app.showToast('Đã cập nhật bản nháp trong phiên làm việc', 'success');
    }
}

function submitRegularReviewFiltered() {
    const ids = getRegularReviewFilteredDraftIds();
    if (!ids.length) {
        app.showToast('Không có bản nháp phù hợp bộ lọc để gửi', 'info');
        return;
    }
    app.showConfirmModal(ids);
}

function regenerateRegularReviewAll() {
    if (app.isRegularOperationActive() || app.isRegularAssessmentUnavailable()) {
        app.showToast('Vui lòng đợi thao tác đang chạy hoàn tất', 'info');
        return;
    }
    app.autoCommentAll();
}

function regenerateRegularReviewFiltered() {
    const ids = getRegularReviewFilteredPresentIds();
    if (!ids.length) {
        app.showToast('Không có học sinh có mặt phù hợp bộ lọc', 'info');
        return;
    }
    app.autoCommentAll(ids);
}

function handleRegularReviewGlobalKeydown(event) {
    if (!state.regularReviewMode) return;

    const higherDialog = getOpenHigherPriorityDialog();
    if (higherDialog) {
        if (event.key === 'Tab') trapFocusWithin(higherDialog, event);
        if (event.key === 'Escape' && higherDialog.id !== 'appConfirmModal') {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (higherDialog.id === 'confirmModal') app.hideConfirmModal();
            if (higherDialog.id === 'pastCommentsModal') app.hidePastCommentsModal();
            if (higherDialog.id === 'copyModal') app.hideCopyModal();
        }
        return;
    }

    const target = event.target;
    const isEditable = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target?.isContentEditable;

    if (event.key === 'Escape') {
        const modal = getRegularReviewModal();
        const openDetails = modal?.querySelector('details.toolbar-menu[open], details.quick-template-menu[open], details.detail-overflow[open], details.batch-overflow[open]');
        if (openDetails) {
            event.preventDefault();
            event.stopImmediatePropagation();
            openDetails.removeAttribute('open');
            openDetails.querySelector(':scope > summary')?.focus();
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        if (state.regularReviewSelectedStudentId) app.closeRegularReviewDetail();
        else app.exitRegularReviewMode();
        return;
    }

    if (event.key === 'Tab') {
        trapFocusWithin(getRegularReviewModal(), event);
        return;
    }

    if (isEditable || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    const rows = filterRegularReviewRows();
    if (!rows.length) return;
    const currentIndex = rows.findIndex(row => row.studentId === state.regularReviewSelectedStudentId);
    const nextIndex = event.key === 'ArrowDown'
        ? Math.min(rows.length - 1, currentIndex < 0 ? 0 : currentIndex + 1)
        : Math.max(0, currentIndex < 0 ? 0 : currentIndex - 1);
    event.preventDefault();
    app.openRegularReviewDetail(rows[nextIndex].studentId);
}

if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', handleRegularReviewGlobalKeydown);
}

Object.assign(app, {
    stripReviewComment,
    normalizeReviewText,
    getReviewSignature,
    buildReviewDuplicateCounts,
    getRegularReviewRows,
    filterRegularReviewRows,
    getRegularReviewAllDraftIds,
    getRegularReviewFilteredDraftIds,
    getRegularReviewFilteredPresentIds,
    renderRegularReview,
    openRegularReviewModalShell,
    forceCloseRegularReviewModal,
    handleRegularReviewBackdropClick,
    enterRegularReviewMode,
    exitRegularReviewMode,
    toggleRegularReviewMode,
    openRegularReviewDetail,
    closeRegularReviewDetail,
    setRegularReviewSearch,
    queueRegularReviewSearch,
    setRegularReviewFilter,
    resetRegularReviewFilters,
    refreshRegularReviewWarnings,
    syncRegularReviewComment,
    updateRegularReviewComment,
    setRegularReviewLearningLevel,
    handleRegularReviewTextareaKeydown,
    submitRegularReviewFiltered,
    regenerateRegularReviewAll,
    regenerateRegularReviewFiltered,
});

export {
    normalizeReviewText,
    getReviewSignature,
    buildReviewDuplicateCounts,
    filterRegularReviewRows,
};
