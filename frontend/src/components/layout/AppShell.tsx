import type { PropsWithChildren } from 'react';
import { ConfigPanel } from '../../features/configuration/ConfigPanel';
import { Header } from './Header';
export function AppShell({ children, page = 'comments', showConfig = true }: PropsWithChildren<{ page?: 'comments' | 'homework'; showConfig?: boolean }>) { return <div className="app-container"><Header page={page} />{showConfig && <ConfigPanel />}{children}</div>; }
