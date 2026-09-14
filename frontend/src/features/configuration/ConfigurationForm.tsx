import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Save, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { UpdateConfigRequestSchema, type PublicConfig, type ThinkingLevel, type UpdateConfigRequest } from '@tool-lms/contracts';
import { z } from 'zod';
import { useAuth } from '../../app/providers';
import { Input, Textarea } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { createOperationController, currentAuthEpoch, isCurrentAuthEpoch, releaseOperationController } from '../../lib/operationContext';
import { readAiApiKey, writeAiApiKey } from '../../lib/persistence';
import { useCommentStore } from '../comments/public/store';
import { configQuery, modelsQuery, updateConfig } from './api';
import { CUSTOM_AI_MODEL_ID, FALLBACK_THINKING_LEVELS, modelSelectOptions } from './modelOptions';

const FormSchema = UpdateConfigRequestSchema.extend({
  apiKey: z.string().max(2_000),
  commentLength: z.enum(['short', 'medium', 'long']),
  customPrompt: z.string().max(2_000),
});
type FormValues = z.infer<typeof FormSchema>;
const THINKING_LEVEL_CHOICES: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export function ConfigurationForm() {
  const auth = useAuth();
  const toast = useToast();
  const client = useQueryClient();
  const principal = auth.session?.email || null;
  const config = useQuery(configQuery());
  const [loadedPrincipal, setLoadedPrincipal] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(FormSchema), defaultValues: valuesFromConfig(config.data?.data) });
  const apiKey = form.watch('apiKey');
  const modelId = form.watch('aiModel');
  const customModelId = form.watch('customModelId');
  const thinkingLevel = form.watch('thinkingLevel');
  const commentLength = form.watch('commentLength');
  const customPrompt = form.watch('customPrompt');
  const models = useQuery(modelsQuery(apiKey.trim()));
  const modelOptions = useMemo(() => modelSelectOptions(models.data?.data.models, modelId), [modelId, models.data]);
  const selected = modelOptions.find((model) => model.id === modelId);
  const supported = selected?.thinkingLevels || config.data?.data.thinkingLevels || FALLBACK_THINKING_LEVELS;

  useEffect(() => {
    useCommentStore.getState().setGenerationConfig({ modelId, customModelId, thinkingLevel, commentLength, customPrompt, apiKey });
  }, [apiKey, commentLength, customModelId, customPrompt, modelId, thinkingLevel]);

  useEffect(() => {
    setLoadedPrincipal(null);
    form.reset(valuesFromConfig(config.data?.data));
  }, [form, principal]);

  useEffect(() => {
    if (!config.data) return;
    form.reset(valuesFromConfig(config.data.data));
    setLoadedPrincipal(principal);
  }, [config.data, form, principal]);

  useEffect(() => {
    if (supported.includes(thinkingLevel)) return;
    const next = (['high', 'medium', 'low', 'minimal', 'xhigh', 'off'] as const).find((level) => supported.includes(level)) || 'off';
    form.setValue('thinkingLevel', next);
  }, [form, supported, thinkingLevel]);

  const mutation = useMutation({
    mutationFn: ({ values, signal }: { values: UpdateConfigRequest; signal: AbortSignal }) => updateConfig(values, signal),
    retry: false,
  });
  const configReady = Boolean(principal && loadedPrincipal === principal && config.data);

  const submit = form.handleSubmit(async (values) => {
    if (!configReady) return;
    const epoch = currentAuthEpoch();
    const controller = createOperationController();
    writeAiApiKey(values.apiKey);
    try {
      const response = await mutation.mutateAsync({
        values: {
          aiModel: values.aiModel,
          customModelId: values.aiModel === CUSTOM_AI_MODEL_ID ? values.customModelId : '',
          thinkingLevel: values.thinkingLevel,
          commentLength: values.commentLength,
          customPrompt: values.customPrompt,
        },
        signal: controller.signal,
      });
      if (!isCurrentAuthEpoch(epoch) || controller.signal.aborted) return;
      client.setQueryData(configQuery().queryKey, response);
      toast.show('Đã lưu cấu hình!');
    } catch (error) {
      if (isCurrentAuthEpoch(epoch) && !controller.signal.aborted) toast.show(error instanceof Error ? error.message : 'Không thể lưu cấu hình.', 'error');
    } finally {
      releaseOperationController(controller);
    }
  });

  return (
    <form onSubmit={submit} className="config-section" noValidate>
      <h3><Settings2 size={16} />Cấu hình Auto Comment</h3>
      <label className="form-label" htmlFor="aiModel">Model AI</label>
      <div className="inline-field">
        <select id="aiModel" className="form-select" {...form.register('aiModel')} value={modelId}>
          {modelOptions.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
        </select>
        <button type="button" className="icon-button" aria-label="Tải lại danh sách model" onClick={() => void models.refetch()}><RefreshCw size={16} /></button>
      </div>
      <p className="form-hint">{models.isFetching ? 'Đang tải danh sách model...' : models.data ? `${models.data.data.models.length} model · ${models.data.data.source}` : 'Danh sách model dự phòng'}</p>
      {modelId === CUSTOM_AI_MODEL_ID && (
        <>
          <label className="form-label" htmlFor="customModelId">Tên model custom</label>
          <Input id="customModelId" placeholder="VD: gpt-5.4" {...form.register('customModelId')} />
        </>
      )}
      <label className="form-label" htmlFor="thinkingLevel">Thinking level</label>
      <select id="thinkingLevel" className="form-select" {...form.register('thinkingLevel')} value={thinkingLevel}>
        {THINKING_LEVEL_CHOICES.map((level) => <option key={level} value={level} disabled={!supported.includes(level)}>{level}</option>)}
      </select>
      <p className="form-hint">Hỗ trợ: {supported.join(', ')}</p>
      <label className="form-label" htmlFor="commentLength">Độ dài nhận xét</label>
      <select id="commentLength" className="form-select" {...form.register('commentLength')} value={commentLength}>
        <option value="short">Ngắn (2-3 câu)</option>
        <option value="medium">Vừa (3-4 câu)</option>
        <option value="long">Dài (4-5 câu)</option>
      </select>
      <label className="form-label" htmlFor="customPrompt">Prompt bổ sung (tùy chọn)</label>
      <Textarea id="customPrompt" rows={3} placeholder="VD: Nhấn mạnh về BTVN, khen nhiều hơn..." {...form.register('customPrompt')} />
      <label className="form-label" htmlFor="apiKey">API Key</label>
      <Input id="apiKey" type="password" autoComplete="off" placeholder="Nhập API key cho AI" {...form.register('apiKey')} />
      <button type="submit" className="btn btn-success btn-block" disabled={!configReady || mutation.isPending}>
        <Save size={16} />{mutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
      </button>
      {!auth.session && <p className="form-hint">Đăng nhập LMS để lưu cấu hình dùng chung.</p>}
    </form>
  );
}

function valuesFromConfig(config?: PublicConfig): FormValues {
  return {
    aiModel: config?.aiModel || 'gpt-5.4',
    customModelId: config?.customModelId || '',
    thinkingLevel: config?.thinkingLevel || 'high',
    apiKey: readAiApiKey(),
    commentLength: config?.commentLength || 'medium',
    customPrompt: config?.customPrompt || '',
  };
}
