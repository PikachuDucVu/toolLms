import { app } from './registry.js';
import { initTheme } from '../shared/theme.js';
import { initKeyboardShortcuts } from '../shared/keyboard.js';
import './constants.js';
import './core.js';
import './ui.js';
import './auth.js';
import './classes.js';
import './assessments.js';
import './comments.js';
import './review.js';
import './demo.js';
import './checkpoint.js';

initTheme();
initKeyboardShortcuts();

// Init
        const managedDetailsSelector = 'details.toolbar-menu, details.quick-template-menu, details.detail-overflow, details.batch-overflow, details.batch-level-menu';
        const managedDetailsOpenSelector = managedDetailsSelector.split(',').map(selector => `${selector.trim()}[open]`).join(',');
        document.addEventListener('click', event => {
            const target = event.target instanceof Element ? event.target : null;
            const clickedDetails = target?.closest(managedDetailsSelector) || null;
            document.querySelectorAll(managedDetailsOpenSelector).forEach(details => {
                if (details !== clickedDetails) details.removeAttribute('open');
            });
        });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            const opened = document.querySelector(managedDetailsOpenSelector);
            if (!opened) return;
            opened.removeAttribute('open');
            opened.querySelector(':scope > summary')?.focus();
            event.preventDefault();
        });
        window.addEventListener('resize', app.debounce(app.syncRegularDetailPlacement, 120));
        window.addEventListener('beforeunload', event => {
            if (!app.hasUnsavedRegularWork() && !app.isRegularOperationActive()) return;
            event.preventDefault();
            event.returnValue = '';
        });

        // Restore remembered login details so an expired server session can be renewed quickly.
        const savedEmail = localStorage.getItem('lms_email');
        const savedPassword = localStorage.getItem('lms_password');
        if (savedEmail) document.getElementById('email').value = savedEmail;
        if (savedPassword) document.getElementById('password').value = savedPassword;

        app.loadSavedConfig();

        // Load proxy API key from localStorage
        const savedProxyKey = localStorage.getItem('ai_api_key');
        if (savedProxyKey) {
            const keyInput = document.getElementById('proxyApiKey');
            if (keyInput) keyInput.value = savedProxyKey;
        }

        app.initializeConfigPanel({ savedEmail, savedProxyKey });

        // Restore Cloudflare Worker session if the HttpOnly cookie is still valid
        (async () => {
            try {
                if (await app.checkServerSession()) {
                    app.updateLoginStatus(true);
                    app.loadClasses();
                } else {
                    app.showLoginRequired();
                }
            } catch(e) {
                app.updateLoginStatus(false);
                app.showToast(e.message || 'Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.', 'error');
            }
        })();

Object.assign(window, {
    applyTemplate: app.applyTemplate,
    autoCheckpointCommentAll: app.autoCheckpointCommentAll,
    autoCommentAll: app.autoCommentAll,
    cacheDemoInputs: app.cacheDemoInputs,
    closeDetailsMenu: app.closeDetailsMenu,
    confirmRegularNavigation: app.confirmRegularNavigation,
    confirmSubmitAll: app.confirmSubmitAll,
    copyAllZalo: app.copyAllZalo,
    copyZaloComment: app.copyZaloComment,
    debouncedFilterStudents: app.debouncedFilterStudents,
    deleteComment: app.deleteComment,
    doCopyFromModal: app.doCopyFromModal,
    exportToCSV: app.exportToCSV,
    filterStudents: app.filterStudents,
    generateCheckpointComment: app.generateCheckpointComment,
    generateSingle: app.generateSingle,
    hideConfirmModal: app.hideConfirmModal,
    hideCopyModal: app.hideCopyModal,
    hidePastCommentsModal: app.hidePastCommentsModal,
    loadClasses: app.loadClasses,
    toggleRegularReviewMode: app.toggleRegularReviewMode,
    handleRegularReviewBackdropClick: app.handleRegularReviewBackdropClick,
    enterRegularReviewMode: app.enterRegularReviewMode,
    exitRegularReviewMode: app.exitRegularReviewMode,
    openRegularReviewDetail: app.openRegularReviewDetail,
    closeRegularReviewDetail: app.closeRegularReviewDetail,
    setRegularReviewSearch: app.setRegularReviewSearch,
    queueRegularReviewSearch: app.queueRegularReviewSearch,
    setRegularReviewFilter: app.setRegularReviewFilter,
    resetRegularReviewFilters: app.resetRegularReviewFilters,
    setRegularReviewLearningLevel: app.setRegularReviewLearningLevel,
    updateRegularReviewComment: app.updateRegularReviewComment,
    handleRegularReviewTextareaKeydown: app.handleRegularReviewTextareaKeydown,
    submitRegularReviewFiltered: app.submitRegularReviewFiltered,
    regenerateRegularReviewAll: app.regenerateRegularReviewAll,
    regenerateRegularReviewFiltered: app.regenerateRegularReviewFiltered,
    loadSlotStudents: app.loadSlotStudents,
    login: app.login,
    onAiModelChange: app.onAiModelChange,
    onRegularLearningLevelChange: app.onRegularLearningLevelChange,
    onRegularNoteInput: app.onRegularNoteInput,
    randomDemoScores: app.randomDemoScores,
    refreshAiModels: app.refreshAiModels,
    refreshClassData: app.refreshClassData,
    resetStudentFilters: app.resetStudentFilters,
    retryRegularAssessments: app.retryRegularAssessments,
    saveAssessment: app.saveAssessment,
    saveConfig: app.saveConfig,
    saveNote: app.saveNote,
    selectRegularStudent: app.selectRegularStudent,
    setLearningLevelForAll: app.setLearningLevelForAll,
    setCheckpointBranch: app.setCheckpointBranch,
    showConfirmModal: app.showConfirmModal,
    showPastComments: app.showPastComments,
    submitCheckpointAll: app.submitCheckpointAll,
    submitCheckpointScoreSingle: app.submitCheckpointScoreSingle,
    submitCheckpointScoresAll: app.submitCheckpointScoresAll,
    submitCheckpointSingle: app.submitCheckpointSingle,
    submitDemoAll: app.submitDemoAll,
    submitDemoSingle: app.submitDemoSingle,
    submitSingle: app.submitSingle,
    submitSummary: app.submitSummary,
    toggleCheckpointCard: app.toggleCheckpointCard,
    toggleConfig: app.toggleConfig,
    updateCheckpointDescriptionDraft: app.updateCheckpointDescriptionDraft,
    updateCheckpointTotal: app.updateCheckpointTotal,
    updateComment: app.updateComment,
    updateDemoTotal: app.updateDemoTotal
});
