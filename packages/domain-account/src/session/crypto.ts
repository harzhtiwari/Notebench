import { createHash, randomBytes } from "node:crypto";

/**
Settled session configuration (NOTEBENCH 1.41, 6.4, 6.5):
30-day sliding lifetime, 5 failed passcode attempts before a 60s lockout.
Single source of truth: lifetime, lockout count and lockout window come
from here. No literal parameters at call sites.
*/
export const SESSION_CONFIG = {
  /**
  Sliding session lifetime in days.
  */
  lifetimeDays: 30,
  /**
  Sliding session lifetime in seconds (cookie maxAge unit).
  */
  maxAgeSeconds: 30 * 24 * 3600,
  /**
  Failed passcode attempts before the 60s lockout engages.
  */
  lockoutMaxAttempts: 5,
  /**
  Lockout window in seconds.
  */
  lockoutWindowSeconds: 60,
} as const;

/**
Session cookie names (NOTEBENCH 6.5).
`__Host-` prefix over HTTPS (Secure, Path=/, no Domain per prefix rules),
plain name over HTTP for LAN self-hosters.
*/
export const SESSION_COOKIE_NAME_HTTP = "notebench_session";
export const SESSION_COOKIE_NAME_SECURE = "__Host-notebench_session";

/**
Generates a raw session token: 32 CSPRNG bytes, base64url-encoded (6.4).
*/
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
Derives the stored session identifier: SHA-256 hex digest of the raw token.
Database dumps expose zero usable session tokens (6.4).
*/
export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
Resolves the session cookie name for the current transport security.
*/
export function resolveSessionCookieName(isSecure: boolean): string {
  return isSecure ? SESSION_COOKIE_NAME_SECURE : SESSION_COOKIE_NAME_HTTP;
}

/**
Plain-data session cookie attributes shared by every session route.
Mapped 1:1 onto the cookie serializer (HttpOnly, SameSite=Lax, Path=/,
Secure only on HTTPS, 30-day sliding maxAge, signed per 6.4).
*/
export interface SessionCookieOptions {
  httpOnly: boolean;
  sameSite: "lax";
  path: string;
  secure: boolean;
  maxAge: number;
  signed: boolean;
}

export function buildSessionCookieOptions(isSecure: boolean): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecure,
    maxAge: SESSION_CONFIG.maxAgeSeconds,
    signed: true,
  };
}

/**
HTTPS detection for cookie naming (NOTEBENCH 6.5): direct TLS connection
or `X-Forwarded-Proto: https` from a reverse proxy.
*/
export function isSecureRequest(
  protocol: string | undefined,
  forwardedProto: string | string[] | undefined
): boolean {
  if (protocol === "https") {
    return true;
  }
  const first = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  if (typeof first !== "string") {
    return false;
  }
  const clientProto = first.split(",", 1)[0];
  return clientProto?.trim().toLowerCase() === "https";
}
