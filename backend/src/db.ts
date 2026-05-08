import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { loadListingsFromDisk } from "./persistence.js";
import type { Listing, ListingArea } from "./types.js";

export interface DbUser {
  id: string;
  provider: "google" | "facebook" | "reddit" | "github";
  providerUserId: string;
  displayName: string;
  nick: string | null;
  contact: string | null;
  role: "user" | "admin";
  banned: boolean;
  createdAt: string;
  nickChangedAt: string | null;
}

export interface AdminListingView {
  id: string;
  type: "lost" | "found";
  nickname: string;
  status: "active" | "resolved";
  isPublic: boolean;
  createdAt: string;
  ownerId: string;
  hasContact: boolean;
}

function getRepoRoot(): string {
  return process.cwd().endsWith(`${path.sep}backend`) ? path.resolve(process.cwd(), "..") : process.cwd();
}

const repoRoot = getRepoRoot();
const dataDir = path.join(repoRoot, "data");
const dbFile = process.env.DATABASE_PATH ?? path.join(dataDir, "app.db");

if (dbFile !== ":memory:") {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbFile);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    providerUserId TEXT NOT NULL,
    displayName TEXT NOT NULL,
    role TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    UNIQUE(provider, providerUserId)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    nickname TEXT NOT NULL,
    title TEXT,
    description TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    eventDate TEXT,
    eventTime TEXT,
    reward TEXT,
    contact TEXT,
    imageUrl TEXT NOT NULL,
    isPublic INTEGER NOT NULL,
    privateToken TEXT,
    ownerId TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )
`);

const usersInfo = db.prepare("PRAGMA table_info(users)").all() as Record<string, unknown>[];
if (!usersInfo.some((col) => col.name === "nick")) {
  db.exec("ALTER TABLE users ADD COLUMN nick TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nick ON users(nick) WHERE nick IS NOT NULL");
}
if (!usersInfo.some((col) => col.name === "contact")) {
  db.exec("ALTER TABLE users ADD COLUMN contact TEXT");
}
if (!usersInfo.some((col) => col.name === "banned")) {
  db.exec("ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0");
}
if (!usersInfo.some((col) => col.name === "nickChangedAt")) {
  db.exec("ALTER TABLE users ADD COLUMN nickChangedAt TEXT");
}

const tableInfo = db.prepare("PRAGMA table_info(listings)").all() as Record<string, unknown>[];
if (!tableInfo.some((col) => col.name === "area")) {
  db.exec("ALTER TABLE listings ADD COLUMN area TEXT");
}
if (!tableInfo.some((col) => col.name === "updatedAt")) {
  db.exec("ALTER TABLE listings ADD COLUMN updatedAt TEXT");
}
if (!tableInfo.some((col) => col.name === "expiresAt")) {
  db.exec("ALTER TABLE listings ADD COLUMN expiresAt TEXT");
}
if (!tableInfo.some((col) => col.name === "extraImageUrls")) {
  db.exec("ALTER TABLE listings ADD COLUMN extraImageUrls TEXT NOT NULL DEFAULT '[]'");
}
if (!tableInfo.some((col) => col.name === "resolvedAt")) {
  db.exec("ALTER TABLE listings ADD COLUMN resolvedAt TEXT");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    listingId TEXT NOT NULL,
    reason TEXT NOT NULL,
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_logs (
    id TEXT PRIMARY KEY,
    adminId TEXT NOT NULL,
    adminName TEXT NOT NULL,
    action TEXT NOT NULL,
    targetType TEXT NOT NULL,
    targetId TEXT NOT NULL,
    details TEXT,
    createdAt TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    createdAt TEXT NOT NULL,
    createdBy TEXT NOT NULL
  )
`);

const annTableInfo = db.prepare("PRAGMA table_info(announcements)").all() as Array<{ name: string }>;
if (!annTableInfo.some(col => col.name === "expiresAt")) {
  db.exec("ALTER TABLE announcements ADD COLUMN expiresAt TEXT");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_provider_pair ON users(provider, providerUserId);
  CREATE INDEX IF NOT EXISTS idx_listings_public_status ON listings(isPublic, status);
  CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(ownerId);
  CREATE INDEX IF NOT EXISTS idx_listings_private_token ON listings(privateToken);
  CREATE INDEX IF NOT EXISTS idx_reports_listing ON reports(listingId);
  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
  CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(createdAt);
`);

function rowToUser(row: Record<string, unknown>): DbUser {
  const provider = String(row.provider);
  const validProvider = ["facebook", "reddit", "github"].includes(provider) ? (provider as "facebook" | "reddit" | "github") : "google";
  return {
    id: String(row.id),
    provider: validProvider,
    providerUserId: String(row.providerUserId),
    displayName: String(row.displayName),
    nick: row.nick ? String(row.nick) : null,
    contact: row.contact ? String(row.contact) : null,
    role: row.role === "admin" ? "admin" : "user",
    banned: Number(row.banned) === 1,
    createdAt: String(row.createdAt),
    nickChangedAt: row.nickChangedAt ? String(row.nickChangedAt) : null,
  };
}

function rowToListing(row: Record<string, unknown>): Listing {
  let area: ListingArea | undefined;
  if (row.area) {
    try { area = JSON.parse(String(row.area)) as ListingArea; } catch { /* ignore malformed */ }
  }
  return {
    id: String(row.id),
    type: row.type === "found" ? "found" : "lost",
    nickname: String(row.nickname),
    title: row.title ? String(row.title) : undefined,
    description: row.description ? String(row.description) : undefined,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    area,
    eventDate: row.eventDate ? String(row.eventDate) : undefined,
    eventTime: row.eventTime ? String(row.eventTime) : undefined,
    reward: row.reward ? String(row.reward) : undefined,
    contact: row.contact ? String(row.contact) : undefined,
    imageUrl: row.imageUrl ? String(row.imageUrl) : "",
    extraImageUrls: (() => { try { return JSON.parse(String(row.extraImageUrls || "[]")) as string[]; } catch { return []; } })(),
    isPublic: Number(row.isPublic) === 1,
    privateToken: row.privateToken ? String(row.privateToken) : undefined,
    ownerId: String(row.ownerId),
    status: row.status === "resolved" ? "resolved" : "active",

    createdAt: String(row.createdAt),
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
    expiresAt: row.expiresAt ? String(row.expiresAt) : null,
    resolvedAt: row.resolvedAt ? String(row.resolvedAt) : undefined,
  };
}

const insertListingStmt = db.prepare(`
  INSERT INTO listings (
    id, type, nickname, title, description, latitude, longitude, area,
    eventDate, eventTime, reward, contact, imageUrl, extraImageUrls, isPublic,
    privateToken, ownerId, status, createdAt, expiresAt
  ) VALUES (
    @id, @type, @nickname, @title, @description, @latitude, @longitude, @area,
    @eventDate, @eventTime, @reward, @contact, @imageUrl, @extraImageUrls, @isPublic,
    @privateToken, @ownerId, @status, @createdAt, @expiresAt
  )
`);

const upsertUserStmt = db.prepare(`
  INSERT INTO users (id, provider, providerUserId, displayName, role, createdAt)
  VALUES (@id, @provider, @providerUserId, @displayName, @role, @createdAt)
  ON CONFLICT(provider, providerUserId)
  DO UPDATE SET role = excluded.role, displayName = excluded.displayName
`);

function insertListing(listing: Listing): void {
  insertListingStmt.run({
    ...listing,
    isPublic: listing.isPublic ? 1 : 0,
    area: listing.area ? JSON.stringify(listing.area) : null,
    title: listing.title ?? null,
    description: listing.description ?? null,
    eventDate: listing.eventDate ?? null,
    eventTime: listing.eventTime ?? null,
    reward: listing.reward ?? null,
    contact: listing.contact ?? null,
    privateToken: listing.privateToken ?? null,
    expiresAt: listing.expiresAt ?? null,
    extraImageUrls: JSON.stringify(listing.extraImageUrls ?? []),
  });
}

function migrateFromJsonIfNeeded(): void {
  const alreadyMigrated = db.prepare("SELECT value FROM config WHERE key = ?").get("json_migrated") as { value: string } | undefined;
  if (alreadyMigrated) return;

  const fromJson = loadListingsFromDisk();
  if (fromJson.length > 0) {
    const countRow = db.prepare("SELECT COUNT(*) as count FROM listings").get() as { count: number };
    if (countRow.count === 0) {
      const tx = db.transaction((listings: Listing[]) => {
        for (const listing of listings) {
          insertListing(listing);
        }
      });
      tx(fromJson);
    }
  }

  db.prepare("INSERT INTO config(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run("json_migrated", "1");
}

migrateFromJsonIfNeeded();

// Back-fill privateToken for any private listings that were created without one
(function backfillPrivateTokens() {
  const rows = db.prepare("SELECT id FROM listings WHERE isPublic = 0 AND (privateToken IS NULL OR privateToken = '')").all() as { id: string }[];
  const stmt = db.prepare("UPDATE listings SET privateToken = ? WHERE id = ?");
  for (const row of rows) {
    stmt.run(crypto.randomUUID(), row.id);
  }
})();

export function dbUpsertUser(input: {
  provider: "google" | "facebook" | "reddit" | "github";
  providerUserId: string;
  displayName: string;
  role: "user" | "admin";
}): DbUser {
  const existing = db
    .prepare("SELECT * FROM users WHERE provider = ? AND providerUserId = ?")
    .get(input.provider, input.providerUserId) as Record<string, unknown> | undefined;

  const id = existing ? String(existing.id) : crypto.randomUUID();
  const createdAt = existing ? String(existing.createdAt) : new Date().toISOString();

  upsertUserStmt.run({
    id,
    provider: input.provider,
    providerUserId: input.providerUserId,
    displayName: input.displayName,
    role: input.role,
    createdAt
  });

  return dbGetUserById(id) ?? {
    id,
    provider: input.provider,
    providerUserId: input.providerUserId,
    displayName: input.displayName,
    nick: null,
    contact: null,
    role: input.role,
    banned: false,
    createdAt,
    nickChangedAt: null,
  };
}

export function dbGetUserById(id: string): DbUser | undefined {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToUser(row) : undefined;
}

export function dbGetUsersForAdmin(): Array<{
  id: string;
  displayName: string;
  nick: string | null;
  provider: "google" | "facebook" | "reddit" | "github";
  role: "user" | "admin";
  banned: boolean;
  createdAt: string;
  nickChangedAt: string | null;
}> {
  const rows = db
    .prepare("SELECT id, displayName, nick, provider, role, banned, createdAt, nickChangedAt FROM users ORDER BY datetime(createdAt) DESC")
    .all() as Record<string, unknown>[];

  return rows.map((row) => {
    const provider = String(row.provider);
    const validProvider = ["facebook", "reddit", "github"].includes(provider) ? (provider as "facebook" | "reddit" | "github") : "google";
    return {
      id: String(row.id),
      displayName: String(row.displayName),
      nick: row.nick ? String(row.nick) : null,
      provider: validProvider,
      role: row.role === "admin" ? "admin" : "user",
      banned: Number(row.banned) === 1,
      createdAt: String(row.createdAt),
      nickChangedAt: row.nickChangedAt ? String(row.nickChangedAt) : null,
    };
  });
}

export function dbGetListingsForAdmin(): AdminListingView[] {
  const rows = db
    .prepare("SELECT id, type, nickname, status, isPublic, createdAt, ownerId, contact FROM listings ORDER BY datetime(createdAt) DESC")
    .all() as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.id),
    type: row.type === "found" ? "found" : "lost",
    nickname: String(row.nickname),
    status: row.status === "resolved" ? "resolved" : "active",
    isPublic: Number(row.isPublic) === 1,
    createdAt: String(row.createdAt),
    ownerId: String(row.ownerId),
    hasContact: Boolean(row.contact)
  }));
}

const SUMMARY_COLS = "id,type,nickname,title,latitude,longitude,status,createdAt,updatedAt,imageUrl,extraImageUrls,reward,resolvedAt,area,eventDate,eventTime,expiresAt";

export function dbGetPublicListings(): Listing[] {
  const where = "isPublic = 1 AND (expiresAt IS NULL OR expiresAt > datetime('now'))";
  const rows = db
    .prepare(`SELECT ${SUMMARY_COLS} FROM listings WHERE ${where} ORDER BY datetime(createdAt) DESC`)
    .all() as Record<string, unknown>[];
  return rows.map(rowToListing);
}

export function dbGetPublicListingById(id: string): Listing | undefined {
  const row = db
    .prepare("SELECT * FROM listings WHERE id = ? AND isPublic = 1 AND (expiresAt IS NULL OR expiresAt > datetime('now'))")
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToListing(row) : undefined;
}

export function dbGetListingById(id: string): Listing | undefined {
  const row = db.prepare("SELECT * FROM listings WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToListing(row) : undefined;
}

export function dbGetListingsByOwner(ownerId: string): Listing[] {
  const rows = db
    .prepare("SELECT * FROM listings WHERE ownerId = ? ORDER BY datetime(createdAt) DESC")
    .all(ownerId) as Record<string, unknown>[];
  return rows.map(rowToListing);
}

export function dbGetPrivateListingByToken(token: string): Listing | undefined {
  const row = db
    .prepare("SELECT * FROM listings WHERE privateToken = ?")
    .get(token) as Record<string, unknown> | undefined;
  return row ? rowToListing(row) : undefined;
}

export function dbAddListing(listing: Listing): Listing {
  insertListing(listing);
  return listing;
}

export function dbUpdateListingStatus(id: string, status: Listing["status"], resolvedAt?: string): Listing | undefined {
  const result = db.prepare("UPDATE listings SET status = ?, resolvedAt = ? WHERE id = ?").run(
    status,
    status === "resolved" ? (resolvedAt ?? new Date().toISOString().slice(0, 10)) : null,
    id
  );
  if (result.changes === 0) {
    return undefined;
  }
  return dbGetListingById(id);
}

export function dbListingStats(): { total: number; active: number; resolved: number } {
  const notExpired = "(expiresAt IS NULL OR expiresAt > datetime('now'))";
  const total = (db.prepare(`SELECT COUNT(*) as count FROM listings WHERE isPublic = 1 AND ${notExpired}`).get() as { count: number }).count;
  const active = (db.prepare(`SELECT COUNT(*) as count FROM listings WHERE isPublic = 1 AND status = 'active' AND ${notExpired}`).get() as { count: number }).count;
  const resolved = (db.prepare(`SELECT COUNT(*) as count FROM listings WHERE isPublic = 1 AND status = 'resolved' AND ${notExpired}`).get() as { count: number }).count;
  return { total, active, resolved };
}

export function dbGetUserPublicProfile(userId: string): { displayName: string; listings: Listing[] } | undefined {
  const userRow = db.prepare("SELECT id, displayName FROM users WHERE id = ?").get(userId) as Record<string, unknown> | undefined;
  if (!userRow) return undefined;
  const rows = db
    .prepare("SELECT * FROM listings WHERE ownerId = ? AND isPublic = 1 AND status = 'active' AND (expiresAt IS NULL OR expiresAt > datetime('now')) ORDER BY datetime(createdAt) DESC")
    .all(userId) as Record<string, unknown>[];
  return {
    displayName: String(userRow.displayName),
    listings: rows.map(rowToListing),
  };
}

export function dbDeleteUser(id: string): boolean {
  const result = db.prepare("DELETE FROM users WHERE id = ?").run(id);
  return result.changes > 0;
}

export interface AdminReportView {
  id: string;
  listingId: string;
  listingNick: string;
  reason: string;
  comment: string | null;
  status: "pending" | "dismissed" | "acted";
  createdAt: string;
}

export function dbAddReport(listingId: string, reason: string, comment: string | null): void {
  db.prepare(
    "INSERT INTO reports (id, listingId, reason, comment, status, createdAt) VALUES (?, ?, ?, ?, 'pending', ?)"
  ).run(crypto.randomUUID(), listingId, reason, comment ?? null, new Date().toISOString());
}

export function dbGetReportsForAdmin(): AdminReportView[] {
  const rows = db.prepare(`
    SELECT r.id, r.listingId, r.reason, r.comment, r.status, r.createdAt,
           COALESCE(l.nickname, '[deleted]') as listingNick
    FROM reports r
    LEFT JOIN listings l ON l.id = r.listingId
    ORDER BY r.status ASC, datetime(r.createdAt) DESC
  `).all() as Record<string, unknown>[];

  return rows.map(row => ({
    id: String(row.id),
    listingId: String(row.listingId),
    listingNick: String(row.listingNick),
    reason: String(row.reason),
    comment: row.comment ? String(row.comment) : null,
    status: (row.status === "dismissed" || row.status === "acted") ? row.status : "pending",
    createdAt: String(row.createdAt),
  }));
}

export function dbUpdateReportStatus(id: string, status: "dismissed" | "acted"): boolean {
  const result = db.prepare("UPDATE reports SET status = ? WHERE id = ?").run(status, id);
  return result.changes > 0;
}


export interface AdminStats {
  listings: { total: number; active: number; resolved: number; lost: number; found: number };
  users: { total: number; newLast7d: number; newLast30d: number };
  reports: { total: number; pending: number; dismissed: number; acted: number };
  dbSize: number;
  uploadsSize: number;
}

function dirSize(dir: string): number {
  try {
    return fs.readdirSync(dir).reduce((sum, name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return sum + (stat.isDirectory() ? dirSize(full) : stat.size);
    }, 0);
  } catch { return 0; }
}

export function dbGetAdminStats(): AdminStats {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();

  const lRows = db.prepare("SELECT status, type, COUNT(*) as n FROM listings GROUP BY status, type").all() as { status: string; type: string; n: number }[];
  const listingStats = lRows.reduce((acc, r) => {
    acc.total += r.n;
    if (r.status === "active") acc.active += r.n;
    if (r.status === "resolved") acc.resolved += r.n;
    if (r.type === "lost") acc.lost += r.n;
    if (r.type === "found") acc.found += r.n;
    return acc;
  }, { total: 0, active: 0, resolved: 0, lost: 0, found: 0 });

  const uTotal = (db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number }).n;
  const uNew7 = (db.prepare("SELECT COUNT(*) as n FROM users WHERE createdAt >= ?").get(d7) as { n: number }).n;
  const uNew30 = (db.prepare("SELECT COUNT(*) as n FROM users WHERE createdAt >= ?").get(d30) as { n: number }).n;

  const rRows = db.prepare("SELECT status, COUNT(*) as n FROM reports GROUP BY status").all() as { status: string; n: number }[];
  const reportStats = rRows.reduce((acc, r) => {
    acc.total += r.n;
    if (r.status === "pending") acc.pending += r.n;
    if (r.status === "dismissed") acc.dismissed += r.n;
    if (r.status === "acted") acc.acted += r.n;
    return acc;
  }, { total: 0, pending: 0, dismissed: 0, acted: 0 });

  const dbSize = (() => { try { return fs.statSync(dbFile).size; } catch { return 0; } })();
  const uploadsSize = dirSize(path.join(repoRoot, "uploads"));

  return {
    listings: listingStats,
    users: { total: uTotal, newLast7d: uNew7, newLast30d: uNew30 },
    reports: reportStats,
    dbSize,
    uploadsSize,
  };
}

export function dbCheckNickAvailable(nick: string, excludeUserId: string): boolean {
  const row = db.prepare("SELECT id FROM users WHERE nick = ? AND id != ?").get(nick, excludeUserId);
  return !row;
}

export function dbUpdateUserNickContact(id: string, nick: string | null, contact: string | null): DbUser | undefined {
  const current = dbGetUserById(id);
  const nickChanging = nick !== null && nick !== current?.nick;
  try {
    db.transaction(() => {
      const now = nickChanging ? new Date().toISOString() : (current?.nickChangedAt ?? null);
      db.prepare("UPDATE users SET nick = ?, contact = ?, nickChangedAt = ? WHERE id = ?").run(nick, contact, now, id);
      if (nick && nickChanging) db.prepare("UPDATE listings SET nickname = ? WHERE ownerId = ?").run(nick, id);
    })();
  } catch {
    return undefined; // nick UNIQUE constraint violated
  }
  return dbGetUserById(id);
}

export function dbAdminResetNickCooldown(id: string): DbUser | undefined {
  const result = db.prepare("UPDATE users SET nickChangedAt = NULL WHERE id = ?").run(id);
  if (result.changes === 0) return undefined;
  return dbGetUserById(id);
}

export function dbAdminSetUserNick(id: string, nick: string): DbUser | undefined {
  try {
    db.transaction(() => {
      db.prepare("UPDATE users SET nick = ?, nickChangedAt = ? WHERE id = ?").run(nick, new Date().toISOString(), id);
      db.prepare("UPDATE listings SET nickname = ? WHERE ownerId = ?").run(nick, id);
    })();
  } catch {
    return undefined; // UNIQUE constraint
  }
  return dbGetUserById(id);
}

export function dbSetUserBanned(id: string, banned: boolean): DbUser | undefined {
  const result = db.prepare("UPDATE users SET banned = ? WHERE id = ?").run(banned ? 1 : 0, id);
  if (result.changes === 0) return undefined;
  return dbGetUserById(id);
}

export function dbUpdateUserRole(id: string, newRole: "user" | "admin"): DbUser | undefined {
  const result = db.prepare("UPDATE users SET role = ? WHERE id = ?").run(newRole, id);
  if (result.changes === 0) {
    return undefined;
  }
  return dbGetUserById(id);
}

export function dbDeleteListing(id: string): boolean {
  const result = db.prepare("DELETE FROM listings WHERE id = ?").run(id);
  return result.changes > 0;
}

export interface AdminLogEntry {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  targetType: "user" | "listing" | "report";
  targetId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export function dbLogAdminAction(
  adminId: string,
  adminName: string,
  action: string,
  targetType: "user" | "listing" | "report",
  targetId: string,
  details?: Record<string, unknown>
): void {
  db.prepare(
    "INSERT INTO admin_logs (id, adminId, adminName, action, targetType, targetId, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    crypto.randomUUID(),
    adminId,
    adminName,
    action,
    targetType,
    targetId,
    details ? JSON.stringify(details) : null,
    new Date().toISOString()
  );
}

export function dbGetAdminLogs(limit = 200): AdminLogEntry[] {
  const rows = db
    .prepare("SELECT * FROM admin_logs ORDER BY datetime(createdAt) DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];

  return rows.map(row => ({
    id: String(row.id),
    adminId: String(row.adminId),
    adminName: String(row.adminName),
    action: String(row.action),
    targetType: (["user", "listing", "report"].includes(String(row.targetType)) ? row.targetType : "listing") as "user" | "listing" | "report",
    targetId: String(row.targetId),
    details: row.details ? JSON.parse(String(row.details)) as Record<string, unknown> : null,
    createdAt: String(row.createdAt),
  }));
}

export function dbUpdateListing(
  id: string,
  updates: Partial<Pick<Listing, "title" | "description" | "imageUrl" | "extraImageUrls" | "isPublic" | "expiresAt">> & {
    eventDate?: string | null;
    eventTime?: string | null;
    reward?: string | null;
    contact?: string | null;
  }
): Listing | undefined {
  const current = dbGetListingById(id);
  if (!current) return undefined;

  const updatedAt = new Date().toISOString();
  const merged = { ...current, ...updates };

  // Ensure private listings always have a token
  const privateToken = merged.isPublic
    ? null
    : (current.privateToken ?? crypto.randomUUID());

  const result = db
    .prepare(
      `UPDATE listings SET
        title = ?, description = ?, eventDate = ?, eventTime = ?,
        reward = ?, contact = ?, imageUrl = ?, extraImageUrls = ?, isPublic = ?,
        privateToken = ?, updatedAt = ?, expiresAt = ?
       WHERE id = ?`
    )
    .run(
      merged.title ?? null,
      merged.description ?? null,
      merged.eventDate ?? null,
      merged.eventTime ?? null,
      merged.reward ?? null,
      merged.contact ?? null,
      merged.imageUrl,
      JSON.stringify("extraImageUrls" in updates ? (updates.extraImageUrls ?? []) : (current.extraImageUrls ?? [])),
      merged.isPublic ? 1 : 0,
      privateToken,
      updatedAt,
      "expiresAt" in updates ? (updates.expiresAt ?? null) : (current.expiresAt ?? null),
      id
    );

  if (result.changes === 0) return undefined;
  return dbGetListingById(id);
}

export interface Announcement {
  id: string;
  message: string;
  type: "info" | "warning" | "alert";
  createdAt: string;
  createdBy: string;
  expiresAt: string | null;
}

export function dbGetAnnouncements(): Announcement[] {
  return (db.prepare(
    "SELECT * FROM announcements WHERE expiresAt IS NULL OR datetime(expiresAt) > datetime('now') ORDER BY datetime(createdAt) DESC"
  ).all() as Record<string, unknown>[])
    .map(row => ({
      id: String(row.id),
      message: String(row.message),
      type: String(row.type) as Announcement["type"],
      createdAt: String(row.createdAt),
      createdBy: String(row.createdBy),
      expiresAt: row.expiresAt != null ? String(row.expiresAt) : null,
    }));
}

export function dbCreateAnnouncement(adminId: string, message: string, type: Announcement["type"], expiresAt: string | null): Announcement {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare("INSERT INTO announcements (id, message, type, createdAt, createdBy, expiresAt) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, message, type, createdAt, adminId, expiresAt);
  return { id, message, type, createdAt, createdBy: adminId, expiresAt };
}

export function dbDeleteAnnouncement(id: string): boolean {
  return db.prepare("DELETE FROM announcements WHERE id = ?").run(id).changes > 0;
}

export function dbGetListingOwnerByImage(imageFilename: string): { isPublic: boolean; ownerId: string; privateToken: string } | null {
  const pattern = `%/uploads/${imageFilename}%`;
  const row = db.prepare(
    "SELECT isPublic, ownerId, privateToken FROM listings WHERE imageUrl LIKE ? OR extraImageUrls LIKE ? LIMIT 1"
  ).get(pattern, pattern) as { isPublic: number; ownerId: string; privateToken: string } | undefined;
  return row ? { isPublic: Number(row.isPublic) === 1, ownerId: row.ownerId, privateToken: row.privateToken } : null;
}

export function dbCountListingsByOwner(ownerId: string): number {
  const row = db.prepare("SELECT COUNT(*) as n FROM listings WHERE ownerId = ?").get(ownerId) as { n: number };
  return row.n;
}

export function dbGetConfig(key: string): string | null {
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function dbSetConfig(key: string, value: string): void {
  db.prepare("INSERT INTO config(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
