import { z } from 'zod';

export const REQUEST_ID_MAX_LENGTH = 128;
export const ENTITY_ID_MAX_LENGTH = 200;
export const NOTE_MAX_LENGTH = 10_000;
export const COMMENT_MAX_LENGTH = 30_000;
export const BATCH_MAX_ITEMS = 200;

export const RequestIdSchema = z.string().min(1).max(REQUEST_ID_MAX_LENGTH);
export const EntityIdSchema = z.string().trim().min(1).max(ENTITY_ID_MAX_LENGTH);
export const ShortTextSchema = z.string().max(500);
export const NoteSchema = z.string().max(NOTE_MAX_LENGTH);
export const CommentTextSchema = z.string().trim().min(1).max(COMMENT_MAX_LENGTH);

export const ApiErrorCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'UPSTREAM_ERROR',
  'API_KEY_REQUIRED',
  'INTERNAL_ERROR',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().min(1).max(1_000),
    requestId: RequestIdSchema,
    details: z.unknown().optional(),
  }),
});
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;

export function successEnvelope<T extends z.ZodType>(data: T) {
  return z.object({
    success: z.literal(true),
    data,
    requestId: RequestIdSchema,
  });
}

export const EmptySuccessResponseSchema = successEnvelope(z.object({}));
export type EmptySuccessResponse = z.infer<typeof EmptySuccessResponseSchema>;
