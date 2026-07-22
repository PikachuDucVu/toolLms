import { loadSavedHomeworkConfig, onHomeworkAiModelChange, refreshHomeworkAiModels, saveHomeworkConfig } from './config.js';
import { checkServerSession, goToLogin, loadClasses, updateSessionBar } from './session.js';
import { downloadFile, filterSubmissions, loadHomework, toggleSelect, toggleSelectAll } from './submissions.js';
import { aiGradeAllPending, aiGradeSelected, aiGradeSingle, markAllPending, markSelected, markSingle } from './grading.js';
import { initTheme } from '../shared/theme.js';

initTheme();

async function refreshHomework() {
            const btn = document.getElementById('refreshBtn');
            const original = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;margin:0;"></div> Đang tải...';
            try {
                const ok = await loadClasses();
                if (!ok) return;
                if (document.getElementById('classSelect').value) await loadHomework();
            } finally {
                btn.disabled = false;
                btn.innerHTML = original;
            }
        }


// Initialize configuration and restore the current server-side session.
loadSavedHomeworkConfig();
const savedHwApiKey = localStorage.getItem('ai_api_key');
if (savedHwApiKey) {
    const hwKeyInput = document.getElementById('hwApiKey');
    if (hwKeyInput) hwKeyInput.value = savedHwApiKey;
}
document.getElementById('hwApiKey')?.addEventListener('change', function () {
    const value = this.value.trim();
    if (value) localStorage.setItem('ai_api_key', value);
});

(async () => {
    updateSessionBar('checking');
    const sessionReady = await checkServerSession();
    if (sessionReady === false) {
        goToLogin();
        return;
    }
    if (sessionReady !== true) return;
    await loadClasses();
})();

// Bridge functions referenced by static and dynamically-rendered inline handlers.
Object.assign(window, {
    aiGradeAllPending,
    aiGradeSelected,
    aiGradeSingle,
    downloadFile,
    filterSubmissions,
    goToLogin,
    loadHomework,
    markAllPending,
    markSelected,
    markSingle,
    onHomeworkAiModelChange,
    refreshHomework,
    refreshHomeworkAiModels,
    saveHomeworkConfig,
    toggleSelect,
    toggleSelectAll
});
