import { z } from 'zod';
import { successEnvelope } from './common';

export const LoginRequestSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(1_000),
  firebaseKey: z.string().trim().max(500).optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const SessionSchema = z.object({
  authenticated: z.literal(true),
  email: z.string().email().max(320),
  tokenExpiry: z.number().int().nonnegative(),
  displayName: z.string().max(500).optional(),
});
export type Session = z.infer<typeof SessionSchema>;

export const SessionResponseSchema = successEnvelope(SessionSchema);
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export const LoginResponseSchema = SessionResponseSchema;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export const LogoutResponseSchema = successEnvelope(z.object({ loggedOut: z.literal(true) }));
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;
