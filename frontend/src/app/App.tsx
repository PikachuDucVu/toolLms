import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { router } from './router';

export function App() {
  return <ErrorBoundary><Suspense fallback={<RouteLoadingFallback />}><RouterProvider router={router} /></Suspense></ErrorBoundary>;
}

export function RouteLoadingFallback() {
  return <main className="app-container"><section className="state-card" role="status" aria-labelledby="route-loading-title" aria-live="polite" aria-busy="true"><h2 id="route-loading-title">Đang tải trang</h2><p>Vui lòng chờ trong giây lát...</p></section></main>;
}
