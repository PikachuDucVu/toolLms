import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from './app/providers';
import { App } from './app/App';
import { safeClientErrorEvent } from './lib/clientErrorReporting';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root application mount');

createRoot(root, {
  onCaughtError: () => undefined,
  onUncaughtError: (error) => console.error(JSON.stringify(safeClientErrorEvent('react-root-uncaught', error))),
}).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
