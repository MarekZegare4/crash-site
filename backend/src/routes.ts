import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import rateLimit from "express-rate-limit";
import sharp from "sharp";
import { z } from "zod";
import { authMe, mockSocialLogin, requireAdmin, requireAuth, issueToken, roleForSocialUser, AUTH_COOKIE, COOKIE_OPTIONS } from "./mockAuth.js";
import { dbAddListing, dbDeleteListing, dbGetListingById, dbGetPublicListingById, dbGetListingsByOwner, dbGetPrivateListingByToken, dbGetPublicListings, dbListingStats, dbUpdateListing, dbUpdateListingStatus, dbGetListingsForAdmin, dbGetUsersForAdmin, dbDeleteUser, dbUpdateUserRole, dbSetUserBanned, dbAdminResetNickCooldown, dbAdminSetUserNick, dbUpsertUser, dbGetUserPublicProfile, dbAddReport, dbGetReportsForAdmin, dbUpdateReportStatus, dbCheckNickAvailable, dbUpdateUserNickContact, dbGetAdminStats, dbLogAdminAction, dbGetAdminLogs, dbGetAnnouncements, dbCreateAnnouncement, dbDeleteAnnouncement, dbGetConfig, dbSetConfig, dbGetUserById } from "./db.js";
import type { Listing } from "./types.js";
import type { AuthUser } from "./mockAuth.js";

function adminUser(req: Parameters<typeof requireAuth>[0]): AuthUser {
  return (req as typeof req & { user: AuthUser }).user;
}

const repoRoot = process.cwd().endsWith(`${path.sep}backend`) ? path.resolve(process.cwd(), "..") : process.cwd();
const uploadsDir = path.join(repoRoot, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

function deleteListingImages(listing: { imageUrl?: string | null; extraImageUrls?: string[] | null }): void {
  const urls = [listing.imageUrl, ...(listing.extraImageUrls ?? [])].filter(Boolean) as string[];
  for (const url of urls) {
    try {
      const filename = path.basename(new URL(url, "http://x").pathname);
      const filePath = path.join(uploadsDir, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* not a local upload — skip */ }
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    // Always use .tmp so no potentially-executable extension exists on disk during processing
    filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.tmp`),
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = file.mimetype.startsWith("image/");
    if (allowed) { cb(null, true); return; }
    cb(new Error("Only image files are allowed"));
  },
});

const areaSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("circle"), radius: z.number().min(10).max(50000) }),
  z.object({
    type: z.literal("polygon"),
    points: z.array(z.object({ lat: z.number(), lng: z.number() })).min(3).max(100)
  })
]);

const imageUrlSchema = z.string().max(500).refine(
  (u) => u === "" || u.startsWith("/uploads/"),
  "Must be an /uploads/ path"
);

const listingSchema = z.object({
  type: z.enum(["lost", "found"]).default("lost"),
  nickname: z.string().min(2).max(60),
  title: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  area: areaSchema.optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  eventTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reward: z.string().max(120).optional(),
  contact: z.string().max(200).optional(),
  imageUrl: imageUrlSchema.optional(),
  extraImageUrls: z.array(imageUrlSchema).max(2).optional(),
  isPublic: z.boolean().default(true),
  expiresAt: z.string().datetime().nullable().optional()
    .refine(v => !v || new Date(v) > new Date(), "expiresAt must be in the future"),
});

const statusSchema = z.object({
  status: z.enum(["active", "resolved"]),
  resolvedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const isTest = process.env.NODE_ENV === "test";

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many uploads, please try again later" },
});

const createListingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many listings created, please try again later" },
});

// Tight limit on OAuth initiation — prevents abuse of redirect flows
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many auth requests, please try again later" },
});

// Nick availability check — prevents nick enumeration via brute force
const nickCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many nick checks, please slow down" },
});

const privateTokenLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many requests" },
});

const sseLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many SSE connections" },
});

const SSE_MAX_CLIENTS = 500;

// Account deletion is irreversible — strict limit
const deleteAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many account deletion attempts" },
});


export const appRouter = Router();

if (process.env.NODE_ENV !== "production") {
  appRouter.get("/auth/mock-login", mockSocialLogin);
}
appRouter.get("/auth/me", authMe);

appRouter.post("/auth/logout", (req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: COOKIE_OPTIONS.path });
  res.json({ ok: true });
});

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
const CALLBACK_BASE = process.env.OAUTH_CALLBACK_BASE ?? "http://localhost:4000";

const OAUTH_STATE_COOKIE = "oauth_state";
const isProd = process.env.NODE_ENV === "production";

function setStateCookie(res: import("express").Response): string {
  const state = crypto.randomUUID();
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 10 * 60 * 1000,
    secure: isProd,
  });
  return state;
}

function verifyStateCookie(req: import("express").Request, res: import("express").Response): boolean {
  const cookies = (req as typeof req & { cookies?: Record<string, string> }).cookies ?? {};
  const stored = cookies[OAUTH_STATE_COOKIE];
  const received = typeof req.query.state === "string" ? req.query.state : undefined;
  res.clearCookie(OAUTH_STATE_COOKIE, { path: "/api/auth" });
  return !!(stored && received && stored === received);
}

appRouter.get("/auth/providers", (_req, res) => {
  const providers: string[] = [];
  if (process.env.GOOGLE_CLIENT_ID) providers.push("google");
  if (process.env.GITHUB_CLIENT_ID) providers.push("github");
  if (process.env.NODE_ENV !== "production") providers.push("mock");
  res.json(providers);
});

// ── Google OAuth ──────────────────────────────────────────────
appRouter.get("/auth/google", authLimiter, (_req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(501).json({ error: "Google OAuth is not configured" });
    return;
  }
  const state = setStateCookie(res);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${CALLBACK_BASE}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

appRouter.get("/auth/google/callback", authLimiter, async (req, res) => {
  const code = String(req.query.code ?? "");
  if (!code || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    res.redirect(`${FRONTEND_URL}?auth_error=google_misconfigured`);
    return;
  }
  if (!verifyStateCookie(req, res)) {
    res.redirect(`${FRONTEND_URL}?auth_error=google_failed`);
    return;
  }
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${CALLBACK_BASE}/api/auth/google/callback`,
        grant_type: "authorization_code"
      })
    });
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) throw new Error("No access token");

    const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const info = await infoRes.json() as { sub?: string; name?: string };
    if (!info.sub) throw new Error("No user ID from Google");

    const role = roleForSocialUser("google", info.sub);
    const user = dbUpsertUser({ provider: "google", providerUserId: info.sub, displayName: info.name ?? "Google User", role });
    const token = issueToken(user.id);
    res.cookie(AUTH_COOKIE, token, { ...COOKIE_OPTIONS, secure: process.env.NODE_ENV === "production" });
    res.redirect(FRONTEND_URL);
  } catch {
    res.redirect(`${FRONTEND_URL}?auth_error=google_failed`);
  }
});

// ── GitHub OAuth ──────────────────────────────────────────────
appRouter.get("/auth/github", authLimiter, (_req, res) => {
  if (!process.env.GITHUB_CLIENT_ID) {
    res.status(501).json({ error: "GitHub OAuth is not configured" });
    return;
  }
  const state = setStateCookie(res);
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: `${CALLBACK_BASE}/api/auth/github/callback`,
    scope: "read:user",
    state,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

appRouter.get("/auth/github/callback", authLimiter, async (req, res) => {
  const code = String(req.query.code ?? "");
  if (!code || !process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    res.redirect(`${FRONTEND_URL}?auth_error=github_misconfigured`);
    return;
  }
  if (!verifyStateCookie(req, res)) {
    res.redirect(`${FRONTEND_URL}?auth_error=github_failed`);
    return;
  }
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${CALLBACK_BASE}/api/auth/github/callback`
      })
    });
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) throw new Error("No access token");

    const infoRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "crash-site" }
    });
    const info = await infoRes.json() as { id?: number; name?: string; login?: string };
    if (!info.id) throw new Error("No user ID from GitHub");

    const providerUserId = String(info.id);
    const role = roleForSocialUser("github", providerUserId);
    const user = dbUpsertUser({ provider: "github", providerUserId, displayName: info.name ?? info.login ?? "GitHub User", role });
    const token = issueToken(user.id);
    res.cookie(AUTH_COOKIE, token, { ...COOKIE_OPTIONS, secure: process.env.NODE_ENV === "production" });
    res.redirect(FRONTEND_URL);
  } catch {
    res.redirect(`${FRONTEND_URL}?auth_error=github_failed`);
  }
});

appRouter.post("/uploads", uploadLimiter, requireAuth, upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Image file is required" });
    return;
  }

  const originalPath = path.join(uploadsDir, req.file.filename);
  const outName = req.file.filename.replace(/\.[^.]+$/, ".webp");
  const outPath = path.join(uploadsDir, outName);

  try {
    // Sharp strips all EXIF/GPS metadata by default (withMetadata() not called)
    await sharp(originalPath, { failOn: "none" })
      .rotate() // honour EXIF orientation before it gets stripped
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(outPath);
    fs.unlinkSync(originalPath);
  } catch {
    try { fs.unlinkSync(originalPath); } catch { /* ignore */ }
    res.status(422).json({ error: "Cannot process image" });
    return;
  }

  const imageUrl = `/uploads/${outName}`;
  res.status(201).json({ imageUrl });
});


const nickContactSchema = z.object({
  nick: z.string().min(2).max(60).regex(/^[^\s].*[^\s]$|^[^\s]$/, "no leading/trailing spaces").nullable(),
  contact: z.string().max(200).nullable()
});

appRouter.get("/users/nick-check", requireAuth, nickCheckLimiter, (req, res) => {
  const nick = String(req.query.nick ?? "").trim();
  const user = (req as typeof req & { user: { id: string } }).user;
  if (!nick || nick.length < 2) { res.json({ available: false }); return; }
  res.json({ available: dbCheckNickAvailable(nick, user.id) });
});

appRouter.patch("/users/me", requireAuth, (req, res) => {
  const parsed = nickContactSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const user = (req as typeof req & { user: { id: string } }).user;

  if (parsed.data.nick !== null) {
    const current = dbGetUserById(user.id);
    if (current?.nick && parsed.data.nick !== current.nick && current.nickChangedAt) {
      const cooldownDays = parseInt(dbGetConfig("nickCooldownDays") ?? "30", 10);
      const nextAllowed = new Date(current.nickChangedAt);
      nextAllowed.setDate(nextAllowed.getDate() + cooldownDays);
      if (new Date() < nextAllowed) {
        res.status(429).json({ error: "nick_cooldown", nextAllowed: nextAllowed.toISOString() });
        return;
      }
    }
  }

  const updated = dbUpdateUserNickContact(user.id, parsed.data.nick, parsed.data.contact);
  if (!updated) { res.status(409).json({ error: "nick_taken" }); return; }
  let nickNextAllowed: string | null = null;
  if (updated.nickChangedAt) {
    const cooldownDays = parseInt(dbGetConfig("nickCooldownDays") ?? "30", 10);
    const next = new Date(updated.nickChangedAt);
    next.setDate(next.getDate() + cooldownDays);
    if (next > new Date()) nickNextAllowed = next.toISOString();
  }
  res.json({ nick: updated.nick, contact: updated.contact, nickNextAllowed });
});

appRouter.delete("/users/me", requireAuth, deleteAccountLimiter, (req, res) => {
  const user = adminUser(req);
  const listings = dbGetListingsByOwner(user.id);
  for (const listing of listings) {
    deleteListingImages(listing);
    dbDeleteListing(listing.id);
  }
  dbDeleteUser(user.id);
  res.json({ ok: true });
});

appRouter.get("/users/:id/profile", (req, res) => {
  const profile = dbGetUserPublicProfile(req.params.id);
  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(profile);
});

appRouter.get("/listings", (_req, res) => {
  res.json(dbGetPublicListings());
});

appRouter.get("/listings/stats", (_req, res) => {
  res.json(dbListingStats());
});

appRouter.get("/listings/mine", requireAuth, (req, res) => {
  const user = (req as typeof req & { user: { id: string } }).user;
  res.json(dbGetListingsByOwner(user.id));
});

appRouter.get("/listings/:id", (req, res) => {
  const listing = dbGetPublicListingById(req.params.id);
  if (!listing) { res.status(404).json({ error: "Not found" }); return; }
  res.json(listing);
});

appRouter.get("/listings/private/:token", privateTokenLimiter, (req, res) => {
  const listing = dbGetPrivateListingByToken(req.params.token);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  if (listing.status !== "resolved" && listing.expiresAt && new Date(listing.expiresAt) < new Date()) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  res.json(listing);
});

appRouter.post("/listings", createListingLimiter, requireAuth, (req, res) => {
  const parsed = listingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = (req as typeof req & { user: { id: string } }).user;
  const payload = parsed.data;

  const listing: Listing = {
    id: crypto.randomUUID(),
    ...payload,
    imageUrl: payload.imageUrl ?? "",
    extraImageUrls: payload.extraImageUrls ?? [],
    privateToken: payload.isPublic ? undefined : crypto.randomUUID(),
    ownerId: user.id,
    status: "active",
    createdAt: new Date().toISOString(),
    expiresAt: payload.expiresAt ?? null,
  };

  dbAddListing(listing);
  res.status(201).json(listing);
});

const editSchema = z.object({
  title: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  eventTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  reward: z.string().max(120).nullable().optional(),
  contact: z.string().max(200).nullable().optional(),
  imageUrl: imageUrlSchema.optional(),
  extraImageUrls: z.array(imageUrlSchema).max(2).optional(),
  isPublic: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional()
    .refine(v => !v || new Date(v) > new Date(), "expiresAt must be in the future"),
});

appRouter.patch("/listings/:id", requireAuth, (req, res) => {
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = (req as typeof req & { user: { id: string } }).user;
  const listing = dbGetListingById(req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  if (listing.ownerId !== user.id) {
    res.status(403).json({ error: "Only the owner can edit this listing" });
    return;
  }

  const newImageUrl = parsed.data.imageUrl ?? listing.imageUrl;
  const newExtraUrls = parsed.data.extraImageUrls ?? listing.extraImageUrls;
  const newAllUrls = new Set([newImageUrl, ...newExtraUrls].filter(Boolean));
  const removedUrls = [listing.imageUrl, ...listing.extraImageUrls].filter(
    (u): u is string => !!u && !newAllUrls.has(u)
  );
  deleteListingImages({ imageUrl: null, extraImageUrls: removedUrls });

  const updated = dbUpdateListing(req.params.id, parsed.data);
  if (!updated) {
    res.status(500).json({ error: "Update failed" });
    return;
  }
  res.json(updated);
});

appRouter.delete("/listings/:id", requireAuth, (req, res) => {
  const user = (req as typeof req & { user: { id: string } }).user;
  const listing = dbGetListingById(req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  if (listing.ownerId !== user.id) {
    res.status(403).json({ error: "Only owner can delete listing" });
    return;
  }
  deleteListingImages(listing);
  dbDeleteListing(listing.id);
  res.status(204).send();
});

appRouter.patch("/listings/:id/status", requireAuth, (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = (req as typeof req & { user: { id: string } }).user;
  const listing = dbGetListingById(req.params.id);

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  if (listing.ownerId !== user.id) {
    res.status(403).json({ error: "Only owner can update status" });
    return;
  }

  const updated = dbUpdateListingStatus(listing.id, parsed.data.status, parsed.data.resolvedAt);
  res.json(updated);
});

const reportSchema = z.object({
  reason: z.enum(["inappropriate_photo", "vulgar_text", "spam", "other"]),
  comment: z.string().max(500).optional(),
});

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: "Too many reports, please try again later" },
});

appRouter.post("/listings/:id/reports", reportLimiter, (req, res) => {
  const listing = dbGetListingById(req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  dbAddReport(listing.id, parsed.data.reason, parsed.data.comment ?? null);
  res.status(201).json({ ok: true });
});

appRouter.get("/admin/stats", requireAuth, requireAdmin, (_req, res) => {
  res.json(dbGetAdminStats());
});

appRouter.get("/admin/logs", requireAuth, requireAdmin, (_req, res) => {
  res.json(dbGetAdminLogs());
});

appRouter.get("/admin/reports", requireAuth, requireAdmin, (_req, res) => {
  res.json(dbGetReportsForAdmin());
});

const reportStatusSchema = z.object({ status: z.enum(["dismissed", "acted"]) });

appRouter.patch("/admin/reports/:id", requireAuth, requireAdmin, (req, res) => {
  const parsed = reportStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const ok = dbUpdateReportStatus(req.params.id, parsed.data.status);
  if (!ok) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  const admin = adminUser(req);
  dbLogAdminAction(admin.id, admin.displayName, `report_${parsed.data.status}`, "report", req.params.id);

  res.json({ ok: true });
});

appRouter.get("/admin/users", requireAuth, requireAdmin, (_req, res) => {
  res.json(dbGetUsersForAdmin());
});

appRouter.get("/admin/listings", requireAuth, requireAdmin, (_req, res) => {
  // Contact fields are intentionally excluded to protect sensitive data from admin preview.
  res.json(dbGetListingsForAdmin());
});

appRouter.get("/admin/listings/:id", requireAuth, requireAdmin, (req, res) => {
  const listing = dbGetListingById(req.params.id);
  if (!listing) { res.status(404).json({ error: "Not found" }); return; }
  res.json(listing);
});

appRouter.patch("/admin/listings/:id/status", requireAuth, requireAdmin, (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const updated = dbUpdateListingStatus(req.params.id, parsed.data.status, parsed.data.resolvedAt);
  if (!updated) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const admin = adminUser(req);
  dbLogAdminAction(admin.id, admin.displayName, `set_${parsed.data.status}`, "listing", req.params.id, { nick: updated.nickname });

  res.json({ id: updated.id, status: updated.status });
});

const roleSchema = z.object({ role: z.enum(["user", "admin"]) });

appRouter.patch("/admin/users/:id/role", requireAuth, requireAdmin, (req, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const updated = dbUpdateUserRole(req.params.id, parsed.data.role);
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const admin = adminUser(req);
  dbLogAdminAction(admin.id, admin.displayName, `make_${parsed.data.role}`, "user", req.params.id, { displayName: updated.displayName });

  res.json({ id: updated.id, role: updated.role });
});

appRouter.patch("/admin/users/:id/ban", requireAuth, requireAdmin, (req, res) => {
  const parsed = z.object({ banned: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const updated = dbSetUserBanned(req.params.id, parsed.data.banned);
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const admin = adminUser(req);
  dbLogAdminAction(admin.id, admin.displayName, parsed.data.banned ? "ban_user" : "unban_user", "user", req.params.id, { displayName: updated.displayName });

  res.json({ id: updated.id, banned: updated.banned });
});

appRouter.post("/admin/users/:id/reset-nick-cooldown", requireAuth, requireAdmin, (req, res) => {
  const updated = dbAdminResetNickCooldown(req.params.id);
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const admin = adminUser(req);
  dbLogAdminAction(admin.id, admin.displayName, "reset_nick_cooldown", "user", req.params.id, { displayName: updated.displayName });
  res.json({ id: updated.id, nickChangedAt: updated.nickChangedAt });
});

const adminNickSchema = z.object({ nick: z.string().min(2).max(60).regex(/^[^\s].*[^\s]$|^[^\s]$/, "no leading/trailing spaces") });

appRouter.patch("/admin/users/:id/nick", requireAuth, requireAdmin, (req, res) => {
  const parsed = adminNickSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const updated = dbAdminSetUserNick(req.params.id, parsed.data.nick);
  if (!updated) {
    res.status(409).json({ error: "nick_taken" });
    return;
  }
  const admin = adminUser(req);
  dbLogAdminAction(admin.id, admin.displayName, "set_user_nick", "user", req.params.id, { nick: parsed.data.nick, displayName: updated.displayName });
  res.json({ id: updated.id, nick: updated.nick, nickChangedAt: updated.nickChangedAt });
});

appRouter.delete("/admin/listings/:id", requireAuth, requireAdmin, (req, res) => {
  const listing = dbGetListingById(req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  deleteListingImages(listing);
  dbDeleteListing(listing.id);

  const admin = adminUser(req);
  dbLogAdminAction(admin.id, admin.displayName, "delete_listing", "listing", req.params.id, listing ? { nick: listing.nickname } : undefined);

  res.status(204).end();
});

const announcementSchema = z.object({
  message: z.string().min(1).max(500),
  type: z.enum(["info", "warning", "alert"]),
  expiresAt: z.string().datetime().nullable().optional(),
});

// ── Announcements SSE ─────────────────────────────────────────────────────
// In-process registry of connected SSE clients. Works for single-process
// deployments; would need Redis pub/sub if ever horizontally scaled.
const sseClients = new Set<import("express").Response>();

function broadcastAnnouncements(): void {
  if (sseClients.size === 0) return;
  const data = JSON.stringify(dbGetAnnouncements());
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

appRouter.get("/announcements", (_req, res) => {
  res.json(dbGetAnnouncements());
});

appRouter.get("/announcements/stream", sseLimiter, (req, res) => {
  if (sseClients.size >= SSE_MAX_CLIENTS) {
    res.status(503).json({ error: "Too many active connections" });
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Tells nginx upstream not to buffer this response
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Deliver current state immediately so the client never shows stale data
  res.write(`data: ${JSON.stringify(dbGetAnnouncements())}\n\n`);

  sseClients.add(res);

  // Heartbeat every 25 s keeps the connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(": keep-alive\n\n");
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

appRouter.post("/admin/announcements", requireAuth, requireAdmin, (req, res) => {
  const parsed = announcementSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const admin = adminUser(req);
  const ann = dbCreateAnnouncement(admin.id, parsed.data.message, parsed.data.type, parsed.data.expiresAt ?? null);
  dbLogAdminAction(admin.id, admin.displayName, "create_announcement", "listing", ann.id, { message: ann.message, type: ann.type });
  broadcastAnnouncements();
  res.status(201).json(ann);
});

appRouter.delete("/admin/announcements/:id", requireAuth, requireAdmin, (req, res) => {
  const ok = dbDeleteAnnouncement(req.params.id);
  if (!ok) { res.status(404).json({ error: "Not found" }); return; }
  const admin = adminUser(req);
  dbLogAdminAction(admin.id, admin.displayName, "delete_announcement", "listing", req.params.id);
  broadcastAnnouncements();
  res.status(204).end();
});

const ENV_SITE_URL = process.env.SITE_URL?.trim() || null;

function buildConfigResponse() {
  return {
    siteUrl: ENV_SITE_URL ?? dbGetConfig("siteUrl") ?? "",
    siteUrlLocked: ENV_SITE_URL !== null,
    nickCooldownDays: parseInt(dbGetConfig("nickCooldownDays") ?? "30", 10),
  };
}

appRouter.get("/config", (_req, res) => {
  res.json(buildConfigResponse());
});

appRouter.post("/admin/config", requireAuth, requireAdmin, (req, res) => {
  const parsed = z.object({
    siteUrl: z.string().url().or(z.literal("")).optional(),
    nickCooldownDays: z.number().int().min(0).max(365).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const admin = adminUser(req);
  if (parsed.data.siteUrl !== undefined && ENV_SITE_URL === null) {
    dbSetConfig("siteUrl", parsed.data.siteUrl);
    dbLogAdminAction(admin.id, admin.displayName, "set_config", "listing", "siteUrl", { value: parsed.data.siteUrl });
  }
  if (parsed.data.nickCooldownDays !== undefined) {
    dbSetConfig("nickCooldownDays", String(parsed.data.nickCooldownDays));
    dbLogAdminAction(admin.id, admin.displayName, "set_config", "listing", "nickCooldownDays", { value: String(parsed.data.nickCooldownDays) });
  }
  res.json(buildConfigResponse());
});
