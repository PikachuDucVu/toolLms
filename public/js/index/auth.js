import { app } from './registry.js';
import { state } from './state.js';

function setConfigVisible(isVisible) {
            const body = document.getElementById('configBody');
            const text = document.getElementById('configToggleText');
            const toggleBtn = document.querySelector('[aria-controls="configBody"]');
            if (!body || !text) return;

            body.style.display = isVisible ? 'block' : 'none';
            text.textContent = isVisible ? 'Ẩn' : 'Hiện';
            if (toggleBtn) {
                toggleBtn.setAttribute('aria-expanded', String(isVisible));
            }
        }

function toggleConfig() {
            const body = document.getElementById('configBody');
            app.setConfigVisible(body?.style.display === 'none');
        }

function initializeConfigPanel({ savedEmail, savedProxyKey } = {}) {
            const firstVisitKey = 'lms_config_first_visit_seen';
            const isFirstVisit = localStorage.getItem(firstVisitKey) !== '1';
            const hasLoginSetup = Boolean(savedEmail) || Boolean(state.hasServerSession);
            const hasApiSetup = Boolean(savedProxyKey);

            // Lần đầu chưa đăng nhập/chưa có API key thì mở sẵn để setup.
            // Từ các lần sau mặc định thu gọn giống trạng thái bấm nút "Ẩn".
            app.setConfigVisible(isFirstVisit && !hasLoginSetup && !hasApiSetup);

            if (isFirstVisit) {
                localStorage.setItem(firstVisitKey, '1');
            }
        }

function updateLoginStatus(loggedIn) {
            const dot = document.getElementById('statusDot');
            const text = document.getElementById('statusText');
            if (loggedIn) {
                dot.classList.add('online');
                text.textContent = 'Đã đăng nhập';
            } else {
                dot.classList.remove('online');
                text.textContent = 'Chưa đăng nhập';
            }
        }

async function login() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            if (!email || !password) {
                app.showToast('Vui lòng nhập email và password', 'error');
                return;
            }

            try {
                app.showToast('Đang đăng nhập...', 'info');
                await app.firebaseLogin(email, password);

                if (document.getElementById('rememberLogin').checked) {
                    localStorage.setItem('lms_email', email);
                    localStorage.setItem('lms_password', password);
                } else {
                    localStorage.removeItem('lms_email');
                    localStorage.removeItem('lms_password');
                }
                app.updateLoginStatus(true);
                app.showToast('Đăng nhập thành công!');
                const returnTo = app.getReturnToPath();
                if (returnTo) {
                    window.location.assign(returnTo);
                    return;
                }
                app.loadClasses();
            } catch (e) {
                app.showToast('Lỗi đăng nhập: ' + e.message, 'error');
            }
        }

function getThinkingLevelsForModelId(modelId) {
            const lowerId = String(modelId || '').toLowerCase();
            const cached = state.aiModelsCache.find(m => m.id === modelId);
            if (cached?.thinking_levels?.length) return cached.thinking_levels;

            const isGrok = lowerId.includes('grok');
            const isGrokNonReasoning = lowerId.includes('non-reasoning') || lowerId.includes('imagine') || lowerId.includes('image') || lowerId.includes('video');
            const isGrokMultiAgent = lowerId.includes('multi-agent');
            const isReasoning =
                (isGrok && !isGrokNonReasoning) ||
                lowerId.includes('claude') ||
                lowerId.includes('gemini') ||
                lowerId.includes('gpt-5') ||
                lowerId.includes('o1') ||
                lowerId.includes('o3') ||
                lowerId.includes('thinking') ||
                (lowerId.includes('reasoning') && !lowerId.includes('non-reasoning'));

            if (!isReasoning) return ['off'];
            if (isGrok) return isGrokMultiAgent ? ['low', 'medium', 'high', 'xhigh'] : ['low', 'medium', 'high'];
            return ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];
        }

function clampThinkingForModel(modelId, preferred) {
            const levels = app.getThinkingLevelsForModelId(modelId);
            if (preferred && levels.includes(preferred)) return preferred;
            for (const level of ['high', 'medium', 'low', 'minimal', 'xhigh', 'off']) {
                if (levels.includes(level)) return level;
            }
            return levels[0] || 'off';
        }

function resolveEffectiveModelId(aiModel, customModelId) {
            if (aiModel === '__custom__') return (customModelId || '').trim() || 'gpt-5.4';
            return aiModel || 'gpt-5.4';
        }

function toggleCustomModelInput() {
            const aiModel = document.getElementById('aiModel')?.value;
            const customGroup = document.getElementById('customModelGroup');
            if (customGroup) {
                customGroup.style.display = aiModel === '__custom__' ? 'block' : 'none';
            }
        }

function updateThinkingLevelOptions(preferredLevel) {
            const select = document.getElementById('thinkingLevel');
            const hint = document.getElementById('thinkingLevelHint');
            if (!select) return;

            const { aiModel, customModelId } = app.getSelectedModelConfig();
            const modelId = app.resolveEffectiveModelId(aiModel, customModelId);
            const levels = app.getThinkingLevelsForModelId(modelId);
            const current = preferredLevel || select.value || state.savedThinkingLevel || 'high';
            const next = app.clampThinkingForModel(modelId, current);

            select.innerHTML = '';
            for (const level of ['off', 'minimal', 'low', 'medium', 'high', 'xhigh']) {
                const opt = document.createElement('option');
                opt.value = level;
                opt.textContent = level;
                opt.disabled = !levels.includes(level);
                if (level === next) opt.selected = true;
                select.appendChild(opt);
            }
            select.value = next;
            state.savedThinkingLevel = next;

            if (hint) {
                if (levels.length === 1 && levels[0] === 'off') {
                    hint.textContent = 'Model này không hỗ trợ thinking.';
                } else {
                    hint.textContent = `Hỗ trợ: ${levels.join(', ')}`;
                }
            }
        }

function onAiModelChange() {
            app.toggleCustomModelInput();
            app.updateThinkingLevelOptions(state.savedThinkingLevel);
        }

function populateAiModelSelect(models, preferredId) {
            const select = document.getElementById('aiModel');
            if (!select) return;
            const previous = preferredId || select.value;
            select.innerHTML = '';

            const list = Array.isArray(models) && models.length
                ? models
                : [
                    { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 Thinking' },
                    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
                    { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro High' },
                    { id: 'gpt-5.4', name: 'GPT-5.4' },
                    { id: 'grok-4.5', name: 'Grok 4.5' },
                    { id: '__custom__', name: 'Tự nhập tên model' }
                ];

            for (const model of list) {
                const opt = document.createElement('option');
                opt.value = model.id;
                opt.textContent = model.name || model.id;
                if (model.owned_by) opt.dataset.ownedBy = model.owned_by;
                select.appendChild(opt);
            }

            if (previous && [...select.options].some(o => o.value === previous)) {
                select.value = previous;
            } else if ([...select.options].some(o => o.value === 'gpt-5.4')) {
                select.value = 'gpt-5.4';
            }
        }

async function refreshAiModels(preferredId) {
            const sourceEl = document.getElementById('aiModelSource');
            const apiKey = document.getElementById('proxyApiKey')?.value?.trim() || localStorage.getItem('ai_api_key') || '';
            try {
                if (sourceEl) sourceEl.textContent = 'Đang tải danh sách model...';
                const resp = await fetch('/api/ai/models', {
                    headers: apiKey ? { 'x-ai-api-key': apiKey } : {}
                });
                const data = await resp.json();
                state.aiModelsCache = data.models || [];
                app.populateAiModelSelect(state.aiModelsCache, preferredId);
                app.onAiModelChange();
                if (sourceEl) {
                    const count = state.aiModelsCache.filter(m => m.id !== '__custom__').length;
                    if (data.source === 'remote') {
                        sourceEl.textContent = `Đã tải ${count} models từ gateway`;
                    } else if (data.source === 'cache') {
                        const when = data.cached_at ? ` · ${new Date(data.cached_at).toLocaleString('vi-VN')}` : '';
                        sourceEl.textContent = `Dùng list đã cache (${count} models${when})` +
                            (data.error ? ` · key lỗi: ${String(data.error).slice(0, 60)}` : '');
                    } else {
                        sourceEl.textContent = `Dùng list dự phòng (${data.error || 'chưa có cache'})`;
                    }
                }
            } catch (e) {
                app.populateAiModelSelect([], preferredId);
                app.onAiModelChange();
                if (sourceEl) sourceEl.textContent = 'Không tải được models: ' + (e.message || e);
            }
        }

async function loadSavedConfig() {
            try {
                const resp = await fetch('/api/config');
                if (!resp.ok) return;
                const config = await resp.json();
                const customInput = document.getElementById('customModelId');
                if (customInput) customInput.value = config.custom_model_id || '';
                state.savedThinkingLevel = config.thinking_level || 'high';
                await app.refreshAiModels(config.ai_model || 'gpt-5.4');
                app.updateThinkingLevelOptions(state.savedThinkingLevel);
            } catch (e) {
                console.warn('Failed to load saved config:', e);
                await app.refreshAiModels();
            }
        }

function getSelectedModelConfig() {
            const aiModel = document.getElementById('aiModel')?.value || 'gpt-5.4';
            const customModelId = document.getElementById('customModelId')?.value?.trim() || '';
            const thinkingLevel = document.getElementById('thinkingLevel')?.value || state.savedThinkingLevel || 'high';
            const aiApiKey = document.getElementById('proxyApiKey')?.value?.trim() || localStorage.getItem('ai_api_key') || '';
            return { aiModel, customModelId, thinkingLevel, aiApiKey };
        }

async function saveConfig() {
            const { aiModel, customModelId, thinkingLevel } = app.getSelectedModelConfig();

            // Save AI API key to localStorage only
            const aiKey = document.getElementById('proxyApiKey')?.value?.trim() || '';
            if (aiKey) {
                localStorage.setItem('ai_api_key', aiKey);
            }

            state.savedThinkingLevel = thinkingLevel;
            await fetch('/api/save_config', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    ai_model: aiModel,
                    custom_model_id: aiModel === '__custom__' ? customModelId : '',
                    thinking_level: thinkingLevel
                })
            });
            // Refresh models after key save
            await app.refreshAiModels(aiModel);
            app.showToast('Đã lưu cấu hình!');
        }


Object.assign(app, {
    setConfigVisible,
    toggleConfig,
    initializeConfigPanel,
    updateLoginStatus,
    login,
    getThinkingLevelsForModelId,
    clampThinkingForModel,
    resolveEffectiveModelId,
    toggleCustomModelInput,
    updateThinkingLevelOptions,
    onAiModelChange,
    populateAiModelSelect,
    refreshAiModels,
    loadSavedConfig,
    getSelectedModelConfig,
    saveConfig
});
