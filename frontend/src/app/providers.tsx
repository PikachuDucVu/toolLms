import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { ApiError, errorMessage } from '../lib/apiError';
import { onAuthRequired } from '../lib/apiClient';
import { transitionAuthContext } from '../lib/operationContext';
import { listenForStorageResync, preferredTheme, writeTheme, type Theme } from '../lib/persistence';
import { sessionQuery } from '../features/auth/api';
import { ToastProvider } from '../components/ui/Toast';
import { ConfirmProvider } from '../components/ui/ConfirmDialog';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({ theme: 'light', setTheme: () => undefined });
export function useTheme() { return useContext(ThemeContext); }
export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<Theme>(() => preferredTheme());
  const setTheme = useCallback((next: Theme) => { setThemeState(next); writeTheme(next); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => listenForStorageResync(() => setThemeState(preferredTheme())), []);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export interface AuthContextValue {
  session: { email: string; tokenExpiry: number; displayName?: string } | null; loading: boolean; error: unknown; refresh: () => Promise<unknown>;
  acceptSession: (session: { email: string; tokenExpiry: number; displayName?: string }) => Promise<void>; clearSession: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue>({ session: null, loading: true, error: null, refresh: async () => undefined, acceptSession: async () => undefined, clearSession: async () => undefined });
export function useAuth() { return useContext(AuthContext); }
function AuthCoordinator({ children }: PropsWithChildren) {
  const query = useQuery(sessionQuery());
  const [principal, setPrincipal] = useState<string | null>(null);
  useEffect(() => {
    const next = query.data?.data.email || null;
    if (query.isSuccess && next !== principal) {
      void transitionAuthContext(queryClient).then(() => {
        setPrincipal(next);
        if (next) queryClient.setQueryData(sessionQuery().queryKey, query.data);
      });
    }
  }, [query.data, query.isSuccess, principal]);
  useEffect(() => onAuthRequired((error: ApiError) => {
    if (principal !== null) {
      void transitionAuthContext(queryClient).then(() => setPrincipal(null));
    }
    void error;
  }), [principal]);
  const acceptSession = useCallback(async (session: { email: string; tokenExpiry: number; displayName?: string }) => {
    await transitionAuthContext(queryClient);
    setPrincipal(session.email);
    queryClient.setQueryData(sessionQuery().queryKey, { success: true as const, data: { authenticated: true as const, ...session }, requestId: 'client-transition' });
  }, []);
  const clearSession = useCallback(async () => { await transitionAuthContext(queryClient); setPrincipal(null); }, []);
  const queryPrincipal = query.data?.data.email || null;
  const principalTransitionPending = query.isSuccess && queryPrincipal !== principal;
  const value = useMemo<AuthContextValue>(() => ({
    session: principalTransitionPending ? null : query.data?.data || null,
    loading: query.isPending || principalTransitionPending,
    error: query.error,
    refresh: query.refetch,
    acceptSession,
    clearSession,
  }), [query.data, query.error, query.isPending, query.refetch, principalTransitionPending, acceptSession, clearSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AppProviders({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}><ThemeProvider><ToastProvider><ConfirmProvider><AuthCoordinator>{children}</AuthCoordinator></ConfirmProvider></ToastProvider></ThemeProvider></QueryClientProvider>;
}

export function appQueryClient(): QueryClient { return queryClient; }
export function safeErrorMessage(error: unknown): string { return error instanceof ApiError ? `${errorMessage(error)}${error.requestId ? ` (Request ID: ${error.requestId})` : ''}` : errorMessage(error); }
