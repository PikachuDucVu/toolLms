import { z } from 'zod';
import { successEnvelope } from './common';

export const ThinkingLevelSchema = z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);
export type ThinkingLevel = z.infer<typeof ThinkingLevelSchema>;

export const CommentLengthSchema = z.enum(['short', 'medium', 'long']);
export type CommentLength = z.infer<typeof CommentLengthSchema>;

export const PublicConfigSchema = z.object({
  aiModel: z.string().min(1).max(300),
  customModelId: z.string().max(300),
  thinkingLevel: ThinkingLevelSchema,
  thinkingLevels: z.array(ThinkingLevelSchema),
  commentLength: CommentLengthSchema.default('medium'),
  customPrompt: z.string().max(2_000).default(''),
  hasOpenRouterKey: z.boolean(),
});
export type PublicConfig = z.infer<typeof PublicConfigSchema>;
export const ConfigResponseSchema = successEnvelope(PublicConfigSchema);
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;

export const UpdateConfigRequestSchema = z.object({
  aiModel: z.string().trim().min(1).max(300),
  customModelId: z.string().trim().max(300),
  thinkingLevel: ThinkingLevelSchema,
  commentLength: CommentLengthSchema.optional(),
  customPrompt: z.string().trim().max(2_000).optional(),
});
export type UpdateConfigRequest = z.infer<typeof UpdateConfigRequestSchema>;
export const UpdateConfigResponseSchema = ConfigResponseSchema;
export type UpdateConfigResponse = z.infer<typeof UpdateConfigResponseSchema>;

export const AiModelSchema = z.object({
  id: z.string().min(1).max(300),
  name: z.string().min(1).max(500),
  ownedBy: z.string().max(200).optional(),
  reasoning: z.boolean(),
  thinkingLevels: z.array(ThinkingLevelSchema).min(1),
});
export type AiModel = z.infer<typeof AiModelSchema>;
export const AiModelsResponseSchema = successEnvelope(z.object({
  source: z.enum(['remote', 'cache', 'fallback']),
  cachedAt: z.string().datetime().nullable(),
  models: z.array(AiModelSchema).max(2_000),
  thinkingLevels: z.array(ThinkingLevelSchema),
}));
export type AiModelsResponse = z.infer<typeof AiModelsResponseSchema>;
