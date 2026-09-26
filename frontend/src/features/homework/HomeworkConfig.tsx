import type { ThinkingLevel } from '@tool-lms/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogIn, RefreshCw, Save, Settings, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers';
import { Input } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { configQuery, CUSTOM_AI_MODEL_ID, modelSelectOptions, modelsQuery, updateConfig } from '../configuration/public/api';
import { createOperationController, currentAuthEpoch, isCurrentAuthEpoch, releaseOperationController } from '../../lib/operationContext';
import { readAiApiKey, writeAiApiKey } from '../../lib/persistence';
import { runtimeRoutes } from '../../lib/runtimeRoutes';

export interface HomeworkAiOptions {
  aiModel: string;
  customModelId: string;
  thinkingLevel: ThinkingLevel;
  apiKey: string;
}

const LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export function HomeworkConfig({ value, onChange }: { value: HomeworkAiOptions; onChange: (value: HomeworkAiOptions) => void }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [modelRefresh, setModelRefresh] = useState(0);
  const config = useQuery(configQuery());
  const apiKey = effectiveApiKey(value.apiKey);
  const models = useQuery(modelsQuery(apiKey, modelRefresh));
  const save = useMutation({ mutationFn: ({ request, signal }: { request: Parameters<typeof updateConfig>[0]; signal: AbortSignal }) => updateConfig(request, signal), retry: false });

  useEffect(() => {
    if (!config.data) return;
    onChange({
      aiModel: config.data.data.aiModel,
      customModelId: config.data.data.customModelId,
      thinkingLevel: config.data.data.thinkingLevel,
      apiKey: readAiApiKey(),
    });
    // Server config must not wipe the browser-only API key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.data]);

  const selected = models.data?.data.models.find((model) => model.id === value.aiModel);
  const supported = selected?.thinkingLevels || config.data?.data.thinkingLevels || LEVELS;
  useEffect(() => {
    if (supported.includes(value.thinkingLevel)) return;
    const next = (['high', 'medium', 'low', 'minimal', 'xhigh', 'off'] as ThinkingLevel[]).find((level) => supported.includes(level)) || 'off';
    onChange({ ...value, thinkingLevel: next });
  }, [onChange, supported, value]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const set = <K extends keyof HomeworkAiOptions>(key: K, next: HomeworkAiOptions[K]) => onChange({ ...value, [key]: next });
  const saveConfig = async () => {
    if (!auth.session) return;
    const epoch = currentAuthEpoch();
    const controller = createOperationController();
    writeAiApiKey(value.apiKey);
    try {
      const response = await save.mutateAsync({ request: { aiModel: value.aiModel, customModelId: value.aiModel === CUSTOM_AI_MODEL_ID ? value.customModelId : '', thinkingLevel: value.thinkingLevel }, signal: controller.signal });
      if (!isCurrentAuthEpoch(epoch)) return;
      client.setQueryData(configQuery().queryKey, response);
      setModelRefresh((current) => current + 1);
      if (isCurrentAuthEpoch(epoch)) toast.show('Đã lưu cấu hình!');
    } catch (error) {
      if (isCurrentAuthEpoch(epoch) && !controller.signal.aborted) toast.show(error instanceof Error ? `Lỗi lưu cấu hình: ${error.message}` : 'Lỗi lưu cấu hình', 'error');
    } finally {
      releaseOperationController(controller);
    }
  };

  const source = models.isFetching
    ? 'Đang tải danh sách model...'
    : models.data?.data.source === 'remote'
      ? `Đã tải ${models.data.data.models.length} models từ gateway`
      : models.data?.data.source === 'cache'
        ? `Dùng list đã cache (${models.data.data.models.length} models${models.data.data.cachedAt ? ` · ${new Date(models.data.data.cachedAt).toLocaleString('vi-VN')}` : ''})`
        : models.data ? `Dùng list dự phòng (${models.data.data.models.length} models)` : 'Không tải được danh sách model';

  return (
    <>
      {open && <div className="settings-panel-overlay" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside
        id="homework-ai-panel"
        className="settings-panel homework-ai-panel"
        hidden={!open}
        role="dialog"
        aria-labelledby="homework-ai-panel-title"
        aria-modal={open}
      >
        <header className="settings-panel-header">
          <div>
            <h2 id="homework-ai-panel-title">Cấu hình chấm AI</h2>
            <p>Model, thinking level và API key dùng khi chấm bài</p>
          </div>
          <button type="button" className="dialog-close settings-panel-close" aria-label="Đóng cấu hình" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </header>
        <div className="session-bar">
          <div className="session-status" role="status" aria-live="polite"><span className={`session-dot ${auth.loading ? 'checking' : auth.session ? 'ok' : 'bad'}`} />
            <span>{auth.loading ? 'Đang kiểm tra phiên đăng nhập...' : auth.session ? `Đã đăng nhập: ${auth.session.email}` : auth.error ? 'Không kết nối được máy chủ' : 'Phiên đã hết hạn — cần đăng nhập lại'}</span>
          </div>
          {!auth.loading && !auth.session && <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(runtimeRoutes().loginForHomework)}><LogIn size={15} />Đăng nhập</button>}
        </div>
        <div className="homework-config-grid">
          <section className="config-section"><h3><Zap size={16} />Model AI</h3>
            <label className="form-label" htmlFor="homework-ai-model">Model AI</label>
            <div className="inline-field"><select id="homework-ai-model" className="form-select" value={value.aiModel} onChange={(event) => set('aiModel', event.target.value)}>
              {modelSelectOptions(models.data?.data.models, value.aiModel).map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select><button type="button" className="icon-button" aria-label="Tải lại danh sách model" onClick={() => setModelRefresh((current) => current + 1)}><RefreshCw size={16} /></button></div>
            <p className="form-hint">{source}</p>
            {value.aiModel === CUSTOM_AI_MODEL_ID && <><label className="form-label" htmlFor="homework-custom-model">Tên model custom</label><Input id="homework-custom-model" value={value.customModelId} onChange={(event) => set('customModelId', event.target.value)} placeholder="VD: gpt-5.4, gemini-2.5-pro" /></>}
            <label className="form-label" htmlFor="homework-thinking">Thinking level</label>
            <select id="homework-thinking" className="form-select" value={value.thinkingLevel} onChange={(event) => set('thinkingLevel', event.target.value as ThinkingLevel)}>{LEVELS.map((level) => <option key={level} value={level} disabled={!supported.includes(level)}>{level}</option>)}</select>
            <p className="form-hint">{supported.length === 1 && supported[0] === 'off' ? 'Model này không hỗ trợ thinking.' : `Hỗ trợ: ${supported.join(', ')}`}</p>
          </section>
          <section className="config-section"><h3><KeyRound size={16} />API Key</h3>
            <label className="form-label" htmlFor="homework-api-key">API Key AI</label>
            <Input id="homework-api-key" type="password" autoComplete="off" value={value.apiKey} placeholder="Nhập API key cho AI" onChange={(event) => { const next = event.target.value; set('apiKey', next); writeAiApiKey(next); }} />
            <p className="form-hint">{apiKey ? 'Key này được gửi khi tải model và khi chấm bài. Mọi model trong danh sách dùng chung gateway.' : 'Chưa có API key. Nhập key của gateway rồi tải lại danh sách model.'}</p>
            <button type="button" className="btn btn-success btn-block" disabled={!auth.session || save.isPending} onClick={() => void saveConfig()}><Save size={16} />{save.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}</button>
          </section>
        </div>
      </aside>
      <button
        type="button"
        className={`settings-fab${open ? ' is-open' : ''}`}
        aria-label="Cấu hình chấm AI"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="homework-ai-panel"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X size={22} /> : <Settings size={22} />}
      </button>
    </>
  );
}

export function initialHomeworkAiOptions(): HomeworkAiOptions {
  return { aiModel: 'gpt-5.4', customModelId: '', thinkingLevel: 'high', apiKey: readAiApiKey() };
}

export function effectiveApiKey(input: string): string { return input.trim() || readAiApiKey(); }
