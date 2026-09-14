import type { AiModel, ThinkingLevel } from '@tool-lms/contracts';

export const CUSTOM_AI_MODEL_ID = '__custom__';
export const FALLBACK_AI_MODEL_ID = 'gpt-5.4';
export const FALLBACK_THINKING_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export function modelSelectOptions(models: AiModel[] | undefined, selectedId: string): AiModel[] {
  const options = models?.length ? [...models] : [];
  const selected = selectedId.trim();
  if (selected && !options.some((model) => model.id === selected)) {
    options.unshift(syntheticModel(selected));
  }
  if (!options.length) options.push(syntheticModel(selected || FALLBACK_AI_MODEL_ID));
  return options;
}

function syntheticModel(id: string): AiModel {
  return {
    id,
    name: id === CUSTOM_AI_MODEL_ID ? 'Tự nhập tên model' : id === FALLBACK_AI_MODEL_ID ? 'GPT-5.4' : id,
    reasoning: true,
    thinkingLevels: FALLBACK_THINKING_LEVELS,
  };
}
