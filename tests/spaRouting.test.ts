import { describe, expect, it } from 'vitest';
import { app } from '../src/router';

const knownAssets = new Set(['/new/index.html']);
function envWithAssets() {
  return {
    ASSETS: {
      fetch(request: Request) {
        const path = new URL(request.url).pathname;
        if (!knownAssets.has(path) && !path.startsWith('/new/assets/present-')) return Promise.resolve(new Response('asset not found', { status: 404, headers: { 'content-type': 'text/plain' } }));
        const contentType = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : /\.(?:jpg|png|webp)$/.test(path) ? 'image/jpeg' : 'text/html';
        return Promise.resolve(new Response(`asset:${path}`, { headers: { 'content-type': contentType } }));
      },
    },
  } as any;
}

describe('React SPA routing', () => {
  it('applies document security headers on the React HTML response', async () => {
    const response = await app.request('http://local.test/', {}, envWithAssets());
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('same-origin');
  });

  it.each([
    ['/', '/new/index.html'],
    ['/?view=comments', '/new/index.html'],
    ['/homework', '/new/index.html'],
    ['/homework/', '/new/index.html'],
    ['/homework/?class=fixture', '/new/index.html'],
    ['/new', '/new/index.html'],
    ['/new/', '/new/index.html'],
    ['/new/?preview=react', '/new/index.html'],
    ['/new/homework', '/new/index.html'],
    ['/new/homework/', '/new/index.html'],
    ['/new/homework/?class=fixture', '/new/index.html'],
  ])('serves %s from %s', async (route, asset) => {
    const response = await app.request(`http://local.test${route}`, {}, envWithAssets());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(`asset:${asset}`);
  });

  it.each([
    ['/new/assets/present-app.js', 'text/javascript'],
    ['/new/assets/present-app.css', 'text/css'],
    ['/new/assets/present-image.jpg', 'image/jpeg'],
  ])('serves %s with %s instead of SPA HTML', async (path, contentType) => {
    const response = await app.request(`http://local.test${path}`, {}, envWithAssets());
    expect(response.headers.get('content-type')).toContain(contentType);
    expect(await response.text()).toBe(`asset:${path}`);
  });

  it('keeps missing React assets as asset 404s rather than the SPA document', async () => {
    const response = await app.request('http://local.test/new/assets/missing-app.js', {}, envWithAssets());
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).not.toContain('/new/index.html');
  });

  it.each(['/docs', '/docs/unknown?query=1', '/new/not-a-client-document', '/js/index/main.js', '/css/shared.css'])('does not rewrite unknown document %s', async (path) => {
    const response = await app.request(`http://local.test${path}`, {}, envWithAssets());
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('asset not found');
  });

  it.each([
    ['/index.html', '/'],
    ['/homework.html', '/homework'],
  ])('redirects retired legacy document %s to %s', async (path, location) => {
    const response = await app.request(`http://local.test${path}`, {}, envWithAssets());
    expect(response.status).toBe(301);
    expect(new URL(response.headers.get('location') || '', 'http://local.test').pathname).toBe(location);
  });

  it('keeps unknown API GETs as JSON 404 and unsupported methods as non-document 404s', async () => {
    const missing = await app.request('http://local.test/api/not-real?query=1', {}, envWithAssets());
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toContain('application/json');
    expect(await missing.json()).toEqual({ success: false, error: 'Not found' });

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await app.request('http://local.test/api/not-real', { method }, envWithAssets());
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('asset:/');
    }
  });
});
