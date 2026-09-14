import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

const CommentsRoute = lazy(async () => {
  const module = await import('../routes/CommentsRoute');
  return { default: module.CommentsRoute };
});
const HomeworkRoute = lazy(async () => {
  const module = await import('../routes/HomeworkRoute');
  return { default: module.HomeworkRoute };
});

export const router = createBrowserRouter([
  { path: '/', element: <CommentsRoute /> },
  { path: '/homework', element: <HomeworkRoute /> },
  { path: '/new', element: <CommentsRoute /> },
  { path: '/new/homework', element: <HomeworkRoute /> },
  { path: '*', element: <Navigate to="/new" replace /> },
]);
