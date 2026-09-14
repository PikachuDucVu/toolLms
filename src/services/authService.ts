import type { Env, SessionRecord } from '../types';
import { getConfig, saveConfig } from './configService';
import { LmsClient } from './lmsClient';
import { createSession, destroySession, saveSession } from './sessionService';

export interface LoginCredentials {
  email: string;
  password: string;
  firebaseKey?: string;
}

export async function loginWithCredentials(env: Env, request: Request, credentials: LoginCredentials): Promise<SessionRecord> {
  const config = await getConfig(env);
  const firebaseKey = credentials.firebaseKey || String(config.firebase_key || '') || undefined;
  if (credentials.firebaseKey) await saveConfig(env, { firebase_key: credentials.firebaseKey });

  const login = await new LmsClient(env).login(credentials.email, credentials.password, firebaseKey);
  await destroySession(env, request);
  return createSession(env, {
    email: login.email,
    displayName: login.displayName,
    firebaseKey,
    lmsToken: login.lmsToken,
    refreshToken: login.refreshToken,
    tokenExpiry: login.tokenExpiry,
  });
}

export async function refreshActiveSession(env: Env, session: SessionRecord): Promise<SessionRecord> {
  const activeSession = await new LmsClient(env).ensureSession(session);
  await saveSession(env, activeSession);
  return activeSession;
}
