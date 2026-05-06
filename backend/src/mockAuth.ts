import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { dbGetUserById, dbUpsertUser, dbGetConfig, type DbUser } from "./db.js";

export interface AuthUser {
  id: string;
  provider: "google" | "facebook" | "reddit" | "github";
  providerUserId: string;
  displayName: string;
  nick: string | null;
  contact: string | null;
  role: "user" | "admin";
  banned: boolean;
  nickNextAllowed: string | null;
}

interface JwtPayload {
  sub: string;
}

export const AUTH_COOKIE = "session";
export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: 12 * 60 * 60 * 1000, // 12 h — matches JWT expiry
};

const JWT_SECRET = process.env.AUTH_JWT_SECRET ?? "dev-only-secret-change-in-production";

function adminPairsFromEnv(): Set<string> {
  const raw = process.env.ADMIN_SOCIAL_IDS ?? "";
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(values);
}

export function roleForSocialUser(provider: "google" | "facebook" | "reddit" | "github", providerUserId: string): "user" | "admin" {
  const key = `${provider}:${providerUserId}`;
  return adminPairsFromEnv().has(key) ? "admin" : "user";
}

export function issueToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "12h" });
}

function toAuthUser(user: DbUser): AuthUser {
  let nickNextAllowed: string | null = null;
  if (user.nickChangedAt) {
    const cooldownDays = parseInt(dbGetConfig("nickCooldownDays") ?? "30", 10);
    const next = new Date(user.nickChangedAt);
    next.setDate(next.getDate() + cooldownDays);
    if (next > new Date()) nickNextAllowed = next.toISOString();
  }
  return {
    id: user.id,
    provider: user.provider,
    providerUserId: user.providerUserId,
    displayName: user.displayName,
    nick: user.nick,
    contact: user.contact,
    role: user.role,
    banned: user.banned,
    nickNextAllowed,
  };
}

function extractToken(req: Request): string | undefined {
  // Cookie takes priority; Authorization header kept as fallback
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[AUTH_COOKIE];
  if (cookie) return cookie;
  const auth = req.headers.authorization;
  return auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
}

export function verifyToken(token: string): AuthUser | undefined {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = dbGetUserById(payload.sub);
    return user ? toAuthUser(user) : undefined;
  } catch {
    return undefined;
  }
}

export function mockSocialLogin(req: Request, res: Response): void {
  const providerParam = String(req.query.provider ?? "google").toLowerCase();
  const provider = ["facebook", "reddit", "github"].includes(providerParam) ? (providerParam as "facebook" | "reddit" | "github") : "google";
  const providerUserId = String(req.query.providerUserId ?? "demo-user");
  const displayName = String(req.query.displayName ?? "Demo User");

  const role = roleForSocialUser(provider, providerUserId);
  const user = dbUpsertUser({ provider, providerUserId, displayName, role });
  const token = issueToken(user.id);

  res
    .cookie(AUTH_COOKIE, token, {
      ...COOKIE_OPTIONS,
      secure: process.env.NODE_ENV === "production",
    })
    .json({ user: toAuthUser(user) });
}

export function authMe(req: Request, res: Response): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  res.json({ user });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  if (user.banned) {
    res.status(403).json({ error: "Account suspended" });
    return;
  }

  (req as Request & { user: AuthUser }).user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: AuthUser }).user;
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
