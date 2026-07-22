import { showToast } from '../shared/toast.js';
import { state } from './state.js';

export function getHwThinkingLevelsForModelId(modelId) {
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

export function clampHwThinkingForModel(modelId, preferred) {
            const levels = getHwThinkingLevelsForModelId(modelId);
            if (preferred && levels.includes(preferred)) return preferred;
            for (const level of ['high', 'medium', 'low', 'minimal', 'xhigh', 'off']) {
                if (levels.includes(level)) return level;
            }
            return levels[0] || 'off';
        }

export function resolveHwEffectiveModelId(aiModel, customModelId) {
            if (aiModel === '__custom__') return (customModelId || '').trim() || 'gpt-5.4';
            return aiModel || 'gpt-5.4';
        }

export function toggleHomeworkCustomModelInput() {
            const aiModel = document.getElementById('aiModel')?.value;
            const group = document.getElementById('customModelGroup');
            if (group) {
                group.style.display = aiModel === '__custom__' ? 'block' : 'none';
            }
        }

export function updateHomeworkThinkingLevelOptions(preferredLevel) {
            const select = document.getElementById('thinkingLevel');
            const hint = document.getElementById('thinkingLevelHint');
            if (!select) return;

            const { aiModel, customModelId } = getHomeworkSelectedModel();
            const modelId = resolveHwEffectiveModelId(aiModel, customModelId);
            const levels = getHwThinkingLevelsForModelId(modelId);
            const current = preferredLevel || select.value || state.savedThinkingLevel || 'high';
            const next = clampHwThinkingForModel(modelId, current);

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
                hint.textContent = levels.length === 1 && levels[0] === 'off'
                    ? 'Model này không hỗ trợ thinking.'
                    : `Hỗ trợ: ${levels.join(', ')}`;
            }
        }

export function onHomeworkAiModelChange() {
            toggleHomeworkCustomModelInput();
            updateHomeworkThinkingLevelOptions(state.savedThinkingLevel);
        }

export function populateHomeworkAiModelSelect(models, preferredId) {
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
                select.appendChild(opt);
            }

            if (previous && [...select.options].some(o => o.value === previous)) {
                select.value = previous;
            } else if ([...select.options].some(o => o.value === 'gpt-5.4')) {
                select.value = 'gpt-5.4';
            }
        }

export async function refreshHomeworkAiModels(preferredId) {
            const sourceEl = document.getElementById('aiModelSource');
            const apiKey = document.getElementById('hwApiKey')?.value?.trim() || localStorage.getItem('ai_api_key') || '';
            try {
                if (sourceEl) sourceEl.textContent = 'Đang tải danh sách model...';
                const resp = await fetch('/api/ai/models', {
                    headers: apiKey ? { 'x-ai-api-key': apiKey } : {}
                });
                const data = await resp.json();
                state.aiModelsCache = data.models || [];
                populateHomeworkAiModelSelect(state.aiModelsCache, preferredId);
                onHomeworkAiModelChange();
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
                populateHomeworkAiModelSelect([], preferredId);
                onHomeworkAiModelChange();
                if (sourceEl) sourceEl.textContent = 'Không tải được models: ' + (e.message || e);
            }
        }

export async function loadSavedHomeworkConfig() {
            try {
                const resp = await fetch('/api/config');
                if (!resp.ok) return;
                const config = await resp.json();
                const customInput = document.getElementById('customModelId');
                if (customInput) customInput.value = config.custom_model_id || '';
                state.savedThinkingLevel = config.thinking_level || 'high';
                await refreshHomeworkAiModels(config.ai_model || 'gpt-5.4');
                updateHomeworkThinkingLevelOptions(state.savedThinkingLevel);
            } catch (e) {
                console.warn('Failed to load saved homework config:', e);
                await refreshHomeworkAiModels();
            }
        }

export function getHomeworkSelectedModel() {
            const aiModel = document.getElementById('aiModel')?.value || 'gpt-5.4';
            const customModelId = document.getElementById('customModelId')?.value?.trim() || '';
            const thinkingLevel = document.getElementById('thinkingLevel')?.value || state.savedThinkingLevel || 'high';
            const aiApiKey = document.getElementById('hwApiKey')?.value?.trim() || localStorage.getItem('ai_api_key') || '';
            return { aiModel, customModelId, thinkingLevel, aiApiKey };
        }

export async function saveHomeworkConfig() {
            const { aiModel, customModelId, thinkingLevel } = getHomeworkSelectedModel();
            const aiKey = document.getElementById('hwApiKey')?.value?.trim() || '';
            if (aiKey) localStorage.setItem('ai_api_key', aiKey);
            try {
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
                await refreshHomeworkAiModels(aiModel);
                showToast('Đã lưu cấu hình!');
            } catch (e) {
                showToast('Lỗi lưu cấu hình: ' + e.message, 'error');
            }
        }
