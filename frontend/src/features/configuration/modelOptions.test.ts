import type { AiModel } from '@tool-lms/contracts';
import { describe, expect, it } from 'vitest';
import { modelSelectOptions } from './modelOptions';

const remote: AiModel[] = [
  { id: 'claude-opus-4-6-thinking', name: 'claude-opus-4-6-thinking (antigravity)', reasoning: true, thinkingLevels: ['off', 'high'] },
  { id: 'grok-4.6', name: 'grok-4.6 (xai)', reasoning: true, thinkingLevels: ['low', 'medium', 'high'] },
];

describe('modelSelectOptions', () => {
  it('keeps a saved model visible even when the remote catalog dropped it', () => {
    const options = modelSelectOptions([...remote], 'gpt-5.4');
    expect(options[0]).toMatchObject({ id: 'gpt-5.4', name: 'GPT-5.4' });
    expect(options.map((model) => model.id)).toEqual(['gpt-5.4', 'claude-opus-4-6-thinking', 'grok-4.6']);
  });

  it('does not duplicate a selected model that is already in the catalog', () => {
    expect(modelSelectOptions([...remote], 'grok-4.6').map((model) => model.id)).toEqual(['claude-opus-4-6-thinking', 'grok-4.6']);
  });

  it('falls back to the selected or default model when the catalog is empty', () => {
    expect(modelSelectOptions(undefined, 'grok-4.6')[0]?.id).toBe('grok-4.6');
    expect(modelSelectOptions([], '')[0]?.id).toBe('gpt-5.4');
  });
});
