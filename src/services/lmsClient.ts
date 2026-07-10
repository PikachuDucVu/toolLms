import type { Env, LmsGraphqlResponse, SessionRecord } from "../types";

const DEFAULT_FIREBASE_API_KEY = "AIzaSyAh2Au-mk5ci-hN83RUBqj1fsAmCMdvJx4";
const BASE_API_URL = "https://base-api.mindx.edu.vn/";
const LMS_API_URL = "https://lms-api.mindx.edu.vn/";

const BROWSER_HEADERS = {
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
};

interface LoginResult {
  email: string;
  lmsToken: string;
  refreshToken?: string;
  tokenExpiry: number;
}

export interface LmsCallResult<T = unknown> {
  body: LmsGraphqlResponse<T>;
  session: SessionRecord;
}

export class LmsAuthenticationError extends Error {
  constructor(message = "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.") {
    super(message);
    this.name = "LmsAuthenticationError";
  }
}

function firebaseKey(env: Env, override?: string): string {
  return override || env.FIREBASE_API_KEY || DEFAULT_FIREBASE_API_KEY;
}

async function readJsonResponse<T = any>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `HTTP ${response.status}`);
  }
}

function getSetCookieValues(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const direct = extended.getSetCookie?.();
  if (direct?.length) return direct;
  const value = headers.get("Set-Cookie") || headers.get("set-cookie");
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=]+=[^;,]+)/g).map((part) => part.trim());
}

function cookieHeaderFromResponse(headers: Headers): string {
  return getSetCookieValues(headers)
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function decodeJwtExpiry(token: string): number {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(normalized)) as { exp?: number };
    return parsed.exp ?? 0;
  } catch {
    return 0;
  }
}

function isTokenStillValid(session: SessionRecord): boolean {
  return Boolean(session.lmsToken) && Date.now() / 1000 < session.tokenExpiry - 60;
}

function shouldRetryLmsResponse(status: number, text: string): boolean {
  return status === 401 || status === 403 || /INVALID_TOKEN|Authentication failed|Failed to build auth user/.test(text);
}

function isRefreshAuthenticationFailure(status: number, message: string): boolean {
  return status === 401 || /INVALID_REFRESH_TOKEN|TOKEN_EXPIRED|USER_DISABLED|CREDENTIAL_TOO_OLD_LOGIN_AGAIN|INVALID_GRANT/.test(message);
}

export class LmsClient {
  constructor(private readonly env: Env) {}

  async login(email: string, password: string, firebaseKeyOverride?: string): Promise<LoginResult> {
    const key = firebaseKey(this.env, firebaseKeyOverride);
    const firebaseAuthUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`;
    const firebaseCustomTokenUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(key)}`;
    const firebaseRefreshUrl = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(key)}`;

    const firebaseResp = await fetch(firebaseAuthUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        returnSecureToken: true,
        email,
        password,
        clientType: "CLIENT_TYPE_WEB",
      }),
    });
    const firebaseData = await readJsonResponse<{ idToken?: string; error?: { message?: string } }>(firebaseResp);
    if (!firebaseResp.ok || !firebaseData.idToken) {
      throw new Error(`Firebase login failed: ${firebaseData.error?.message || firebaseResp.status}`);
    }
    const firebaseToken = firebaseData.idToken;

    const loginWithTokenResp = await fetch(BASE_API_URL, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/json",
        Origin: "https://base.mindx.edu.vn",
        Referer: "https://base.mindx.edu.vn/",
      },
      body: JSON.stringify({
        operationName: "loginWithToken",
        variables: { idToken: firebaseToken },
        query: "mutation loginWithToken($idToken: String!) {\n  loginWithToken(idToken: $idToken)\n}\n",
      }),
    });
    const cookie = cookieHeaderFromResponse(loginWithTokenResp.headers);

    const customTokenResp = await fetch(BASE_API_URL, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/json",
        Origin: "https://lms.mindx.edu.vn",
        Referer: "https://lms.mindx.edu.vn/",
        Authorization: `Bearer ${firebaseToken}`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({
        operationName: "GetCustomToken",
        variables: {},
        query: "mutation GetCustomToken{users{getCustomToken{customToken}}}",
      }),
    });
    const customTokenData = await readJsonResponse<any>(customTokenResp);
    const customToken = customTokenData?.data?.users?.getCustomToken?.customToken;
    if (!customTokenResp.ok || customTokenData.errors?.length || !customToken) {
      throw new Error(customTokenData.errors?.[0]?.message || "GetCustomToken failed");
    }

    const exchangeResp = await fetch(firebaseCustomTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    const exchangeData = await readJsonResponse<{ idToken?: string; refreshToken?: string }>(exchangeResp);
    if (!exchangeResp.ok || !exchangeData.idToken) throw new Error("Token exchange failed");

    let lmsToken = exchangeData.idToken;
    let refreshToken = exchangeData.refreshToken;
    let tokenExpiry = decodeJwtExpiry(lmsToken);

    if (refreshToken) {
      const refresh = await this.refreshWithToken(refreshToken, key, firebaseRefreshUrl);
      lmsToken = refresh.lmsToken;
      refreshToken = refresh.refreshToken || refreshToken;
      tokenExpiry = refresh.tokenExpiry || tokenExpiry;
    }

    return { email, lmsToken, refreshToken, tokenExpiry };
  }

  async ensureSession(session: SessionRecord): Promise<SessionRecord> {
    return isTokenStillValid(session) ? session : this.refreshSession(session);
  }

  async refreshSession(session: SessionRecord): Promise<SessionRecord> {
    if (!session.refreshToken) throw new LmsAuthenticationError();
    const key = firebaseKey(this.env, session.firebaseKey);
    const firebaseRefreshUrl = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(key)}`;
    const refreshed = await this.refreshWithToken(session.refreshToken, key, firebaseRefreshUrl);
    return {
      ...session,
      lmsToken: refreshed.lmsToken,
      refreshToken: refreshed.refreshToken || session.refreshToken,
      tokenExpiry: refreshed.tokenExpiry || decodeJwtExpiry(refreshed.lmsToken),
      updatedAt: new Date().toISOString(),
    };
  }

  async callApi<T = unknown>(
    session: SessionRecord,
    operationName: string,
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<LmsCallResult<T>> {
    let activeSession = await this.ensureSession(session);
    let response = await this.fetchGraphql(operationName, query, variables, activeSession.lmsToken);
    let text = await response.text();

    if (shouldRetryLmsResponse(response.status, text)) {
      activeSession = await this.refreshSession(activeSession);
      response = await this.fetchGraphql(operationName, query, variables, activeSession.lmsToken);
      text = await response.text();
      if (shouldRetryLmsResponse(response.status, text)) {
        throw new LmsAuthenticationError();
      }
    }

    try {
      return { body: JSON.parse(text) as LmsGraphqlResponse<T>, session: activeSession };
    } catch {
      return { body: { error: text, status: response.status }, session: activeSession };
    }
  }

  private async refreshWithToken(refreshToken: string, key: string, url: string): Promise<{ lmsToken: string; refreshToken?: string; tokenExpiry: number }> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://lms.mindx.edu.vn",
        Referer: "https://lms.mindx.edu.vn/",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    const data = await readJsonResponse<{
      access_token?: string;
      id_token?: string;
      refresh_token?: string;
      expires_in?: string | number;
      error?: { message?: string };
    }>(response);
    const lmsToken = data.access_token || data.id_token;
    if (!response.ok || !lmsToken) {
      const message = data.error?.message || "Token refresh failed";
      if (isRefreshAuthenticationFailure(response.status, message)) throw new LmsAuthenticationError();
      throw new Error(message);
    }
    const expiresIn = data.expires_in ? Number(data.expires_in) : 0;
    return {
      lmsToken,
      refreshToken: data.refresh_token,
      tokenExpiry: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : decodeJwtExpiry(lmsToken),
    };
  }

  private fetchGraphql(operationName: string, query: string, variables: Record<string, unknown>, lmsToken: string): Promise<Response> {
    return fetch(LMS_API_URL, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/json",
        Authorization: lmsToken,
        Origin: "https://lms.mindx.edu.vn",
        Referer: "https://lms.mindx.edu.vn/",
      },
      body: JSON.stringify({ operationName, variables, query }),
    });
  }
}
