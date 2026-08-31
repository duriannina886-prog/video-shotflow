import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const OWNER_COOKIE = "shotflow_owner";
export const REVIEW_COOKIE = "shotflow_review";

function secret() {
  return (
    process.env.SESSION_SECRET ||
    process.env.OWNER_PASSWORD ||
    "shotflow-dev-secret"
  );
}

export function ownerPasswordConfigured() {
  return Boolean(
    process.env.OWNER_ACCOUNT?.trim() && process.env.OWNER_PASSWORD?.trim(),
  );
}

function safeEqual(input: string, expected: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function credentialsMatch(account: string, password: string) {
  const expectedAccount = process.env.OWNER_ACCOUNT?.trim() ?? "";
  const expectedPassword = process.env.OWNER_PASSWORD ?? "";
  if (!expectedAccount || !expectedPassword) return false;
  const accountOk = safeEqual(account.trim(), expectedAccount);
  const passwordOk = safeEqual(password, expectedPassword);
  return accountOk && passwordOk;
}

function sign(value: string) {
  const h = createHmac("sha256", secret()).update(value).digest("base64url");
  return `${value}.${h}`;
}

function unsign(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i <= 0) return null;
  const value = raw.slice(0, i);
  const given = raw.slice(i + 1);
  const expected = createHmac("sha256", secret()).update(value).digest("base64url");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return value;
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function signOwnerCookie() {
  return sign(`owner:${Date.now()}`);
}

export function signReviewCookie(token: string) {
  return sign(token);
}

export function readOwnerSession(cookieHeader: string | null) {
  const cookies = parseCookies(cookieHeader);
  const value = unsign(cookies[OWNER_COOKIE]);
  return Boolean(value?.startsWith("owner:"));
}

export function readReviewToken(cookieHeader: string | null) {
  const cookies = parseCookies(cookieHeader);
  return unsign(cookies[REVIEW_COOKIE]);
}

export function passwordMatches(input: string) {
  const expected = process.env.OWNER_PASSWORD ?? "";
  if (!expected) return false;
  return safeEqual(input, expected);
}

export function newReviewToken() {
  return randomBytes(24).toString("base64url");
}

export function cookieOptions(maxAgeSec: number) {
  // 用 http://IP:端口 访问时不能带 Secure，否则浏览器不存登录态
  const secure = process.env.COOKIE_SECURE === "true";
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}
