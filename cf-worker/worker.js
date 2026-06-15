/**
 * Cloudflare Worker - MindX API Proxy
 *
 * Routes:
 *   /base-api/*  → https://base-api.mindx.edu.vn/*
 *   /lms-api/*   → https://lms-api.mindx.edu.vn/*
 *   /firebase/*  → https://identitytoolkit.googleapis.com/*
 *   /securetoken/* → https://securetoken.googleapis.com/*
 *
 * Requires X-Api-Key header for authentication.
 * Sets correct Origin/Referer/Host headers.
 * MindX sees Cloudflare IP, not your server IP.
 */

const ROUTES = {
  '/base-api/': {
    upstream: 'https://base-api.mindx.edu.vn/',
    host: 'base-api.mindx.edu.vn',
    origin: 'https://base.mindx.edu.vn',
    referer: 'https://base.mindx.edu.vn/',
  },
  '/lms-api/': {
    upstream: 'https://lms-api.mindx.edu.vn/',
    host: 'lms-api.mindx.edu.vn',
    origin: 'https://lms.mindx.edu.vn',
    referer: 'https://lms.mindx.edu.vn/',
  },
  '/firebase/': {
    upstream: 'https://identitytoolkit.googleapis.com/',
    host: 'identitytoolkit.googleapis.com',
  },
  '/securetoken/': {
    upstream: 'https://securetoken.googleapis.com/',
    host: 'securetoken.googleapis.com',
    origin: 'https://lms.mindx.edu.vn',
    referer: 'https://lms.mindx.edu.vn/',
  },
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle preflight first
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Match route
    let matchedPrefix = null;
    let config = null;
    for (const [prefix, cfg] of Object.entries(ROUTES)) {
      if (path.startsWith(prefix)) {
        matchedPrefix = prefix;
        config = cfg;
        break;
      }
    }

    if (!config) {
      return new Response('Not Found', { status: 404 });
    }

    // Build upstream URL: strip prefix, append rest of path + query
    const restPath = path.slice(matchedPrefix.length);
    const upstreamUrl = config.upstream + restPath + url.search;

    // Clone headers, override Host/Origin/Referer
    const headers = new Headers(request.headers);
    headers.set('Host', config.host);
    if (config.origin) headers.set('Origin', config.origin);
    if (config.referer) headers.set('Referer', config.referer);
    // Remove headers that leak info
    headers.delete('CF-Connecting-IP');
    headers.delete('CF-IPCountry');
    headers.delete('CF-Ray');
    headers.delete('CF-Visitor');
    headers.delete('X-Forwarded-For');
    headers.delete('X-Real-IP');
    headers.delete('X-Api-Key');

    // Forward request
    const upstreamResp = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'follow',
    });

    // Build response
    const respHeaders = new Headers(upstreamResp.headers);
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    respHeaders.set('Access-Control-Allow-Credentials', 'true');

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: respHeaders,
    });
  },
};
