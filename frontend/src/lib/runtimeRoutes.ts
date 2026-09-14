export type RouteFamily = 'preview' | 'root';

export interface RuntimeRoutes {
  family: RouteFamily;
  comments: string;
  homework: string;
  loginForHomework: string;
}

const routes: Record<RouteFamily, RuntimeRoutes> = {
  preview: {
    family: 'preview',
    comments: '/new',
    homework: '/new/homework',
    loginForHomework: '/new?return_to=/new/homework',
  },
  root: {
    family: 'root',
    comments: '/',
    homework: '/homework',
    loginForHomework: '/?return_to=/homework',
  },
};

export function routeFamilyForPath(pathname: string): RouteFamily {
  return pathname === '/new' || pathname === '/new/' || pathname.startsWith('/new/homework') ? 'preview' : 'root';
}

export function runtimeRoutes(pathname = window.location.pathname): RuntimeRoutes {
  return routes[routeFamilyForPath(pathname)];
}

export function safeReturnTo(value: string | null, family: RouteFamily): string | null {
  if (!value) return null;
  const allowed = family === 'preview' ? ['/new', '/new/homework'] : ['/', '/homework'];
  return allowed.includes(value) ? value : null;
}
