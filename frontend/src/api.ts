import type { Listing, ListingStats } from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export function listingImgUrl(listing: { isPublic: boolean; privateToken?: string }, url: string): string {
  if (!listing.isPublic && listing.privateToken) {
    return `${url}?pt=${listing.privateToken}`;
  }
  return url;
}

function normalizeImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return parsed.pathname;
    }
  } catch { /* relative url — fine */ }
  return url;
}

function normalizeListing<T extends { imageUrl?: string; extraImageUrls?: string[] }>(l: T): T {
  return {
    ...l,
    imageUrl: l.imageUrl ? normalizeImageUrl(l.imageUrl) : l.imageUrl,
    extraImageUrls: l.extraImageUrls?.map(normalizeImageUrl),
  };
}

let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(cb: () => void): void {
  onUnauthorized = cb;
}

async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { credentials: "include", ...init });
  if (res.status === 401) onUnauthorized?.();
  return res;
}

export interface AuthUser {
  id: string;
  provider: "google" | "facebook" | "reddit" | "github";
  providerUserId: string;
  displayName: string;
  nick: string | null;
  contact: string | null;
  role: "user" | "admin";
  nickNextAllowed: string | null;
}

export async function fetchListings(): Promise<Listing[]> {
  const res = await fetch(`${API_BASE}/listings`);
  if (!res.ok) throw new Error("Cannot fetch listings");
  return res.json().then((ls: Listing[]) => ls.map(normalizeListing));
}

export async function fetchListingById(id: string): Promise<Listing> {
  const res = await fetch(`${API_BASE}/listings/${id}`);
  if (!res.ok) throw new Error("Cannot fetch listing");
  return res.json().then(normalizeListing);
}

export async function fetchPrivateListing(privateToken: string): Promise<Listing> {
  const res = await fetch(`${API_BASE}/listings/private/${privateToken}`);
  if (!res.ok) throw new Error("Cannot fetch private listing");
  return res.json().then(normalizeListing);
}

export async function fetchStats(): Promise<ListingStats> {
  const res = await fetch(`${API_BASE}/listings/stats`);
  if (!res.ok) throw new Error("Cannot fetch stats");
  return res.json();
}

export async function fetchMyListings(): Promise<Listing[]> {
  const res = await authFetch(`${API_BASE}/listings/mine`);
  if (!res.ok) throw new Error("Cannot fetch my listings");
  return res.json().then((ls: Listing[]) => ls.map(normalizeListing));
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  const res = await authFetch(`${API_BASE}/uploads`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`upload_${res.status}: ${body}`);
  }
  const payload = (await res.json()) as { imageUrl: string };
  return payload.imageUrl;
}

export async function fetchProviders(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/auth/providers`);
  if (!res.ok) return [];
  return res.json();
}

export async function mockSocialLogin(): Promise<AuthUser> {
  const res = await authFetch(`${API_BASE}/auth/mock-login?provider=google&providerUserId=mock-dev-user&displayName=Dev+User`);
  if (!res.ok) throw new Error("Cannot login");
  const payload = (await res.json()) as { user: AuthUser };
  return payload.user;
}

export async function fetchAuthMe(): Promise<AuthUser> {
  const res = await authFetch(`${API_BASE}/auth/me`);
  if (!res.ok) throw new Error("Cannot fetch current user");
  const payload = (await res.json()) as { user: AuthUser };
  return payload.user;
}

export async function logout(): Promise<void> {
  await authFetch(`${API_BASE}/auth/logout`, { method: "POST" });
}

export async function createListing(payload: Omit<Listing, "id" | "ownerId" | "status" | "createdAt" | "privateToken">): Promise<Listing> {
  const res = await authFetch(`${API_BASE}/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Cannot create listing");
  return res.json();
}

export async function deleteListing(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/listings/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Cannot delete listing");
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

export interface AdminUserView {
  id: string;
  displayName: string;
  nick: string | null;
  provider: "google" | "facebook" | "reddit" | "github";
  role: "user" | "admin";
  banned: boolean;
  createdAt: string;
  nickChangedAt: string | null;
}

export async function fetchAdminListingDetail(id: string): Promise<Listing> {
  const res = await authFetch(`${API_BASE}/admin/listings/${id}`);
  if (!res.ok) throw new Error("Not found");
  return res.json();
}

export interface AdminStats {
  listings: { total: number; active: number; resolved: number; lost: number; found: number };
  users: { total: number; newLast7d: number; newLast30d: number };
  reports: { total: number; pending: number; dismissed: number; acted: number };
  dbSize: number;
  uploadsSize: number;
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const res = await authFetch(`${API_BASE}/admin/stats`);
  if (!res.ok) throw new Error("Cannot fetch admin stats");
  return res.json();
}

export async function fetchAdminListings(): Promise<AdminListingView[]> {
  const res = await authFetch(`${API_BASE}/admin/listings`);
  if (!res.ok) throw new Error("Cannot fetch admin listings");
  return res.json();
}

export async function fetchAdminUsers(): Promise<AdminUserView[]> {
  const res = await authFetch(`${API_BASE}/admin/users`);
  if (!res.ok) throw new Error("Cannot fetch admin users");
  return res.json();
}

export async function adminUpdateListingStatus(id: string, status: "active" | "resolved"): Promise<void> {
  const res = await authFetch(`${API_BASE}/admin/listings/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Cannot update listing status");
}

export async function adminDeleteListing(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/admin/listings/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Cannot delete listing");
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

export async function fetchAdminLogs(): Promise<AdminLogEntry[]> {
  const res = await authFetch(`${API_BASE}/admin/logs`);
  if (!res.ok) throw new Error("Cannot fetch admin logs");
  return res.json();
}

export async function adminBanUser(id: string, banned: boolean): Promise<void> {
  const res = await authFetch(`${API_BASE}/admin/users/${id}/ban`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ banned }),
  });
  if (!res.ok) throw new Error("Cannot update ban status");
}

export async function adminUpdateUserRole(id: string, role: "user" | "admin"): Promise<void> {
  const res = await authFetch(`${API_BASE}/admin/users/${id}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error("Cannot update user role");
}

export async function adminResetNickCooldown(id: string): Promise<{ nickChangedAt: string | null }> {
  const res = await authFetch(`${API_BASE}/admin/users/${id}/reset-nick-cooldown`, { method: "POST" });
  if (!res.ok) throw new Error("Cannot reset nick cooldown");
  return res.json() as Promise<{ nickChangedAt: string | null }>;
}

export async function adminSetUserNick(id: string, nick: string): Promise<{ nick: string; nickChangedAt: string | null }> {
  const res = await authFetch(`${API_BASE}/admin/users/${id}/nick`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nick }),
  });
  if (res.status === 409) throw new Error("nick_taken");
  if (!res.ok) throw new Error("Cannot set user nick");
  return res.json() as Promise<{ nick: string; nickChangedAt: string | null }>;
}

export async function editListing(
  id: string,
  payload: Partial<Pick<Listing, "title" | "description" | "imageUrl" | "extraImageUrls" | "isPublic" | "expiresAt">> & {
    eventDate?: string | null;
    eventTime?: string | null;
    reward?: string | null;
    contact?: string | null;
  }
): Promise<Listing> {
  const res = await authFetch(`${API_BASE}/listings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Cannot update listing");
  return res.json();
}

export interface UserPublicProfile {
  displayName: string;
  listings: Listing[];
}

export async function fetchUserProfile(userId: string): Promise<UserPublicProfile> {
  const res = await fetch(`${API_BASE}/users/${userId}/profile`);
  if (!res.ok) throw new Error("User not found");
  return res.json();
}

export type ReportReason = "inappropriate_photo" | "vulgar_text" | "spam" | "other";

export interface AdminReportView {
  id: string;
  listingId: string;
  listingNick: string;
  reason: ReportReason;
  comment: string | null;
  status: "pending" | "dismissed" | "acted";
  createdAt: string;
}

export async function submitReport(listingId: string, reason: ReportReason, comment?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/listings/${listingId}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, comment: comment || undefined }),
  });
  if (!res.ok) throw new Error("Cannot submit report");
}

export async function fetchAdminReports(): Promise<AdminReportView[]> {
  const res = await authFetch(`${API_BASE}/admin/reports`);
  if (!res.ok) throw new Error("Cannot fetch reports");
  return res.json();
}

export async function adminUpdateReportStatus(id: string, status: "dismissed" | "acted"): Promise<void> {
  const res = await authFetch(`${API_BASE}/admin/reports/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Cannot update report");
}

export async function checkNickAvailable(nick: string): Promise<boolean> {
  const res = await authFetch(`${API_BASE}/users/nick-check?nick=${encodeURIComponent(nick)}`);
  if (!res.ok) return false;
  const data = await res.json() as { available: boolean };
  return data.available;
}

export async function updateUserNickContact(nick: string | null, contact: string | null): Promise<{ nick: string | null; contact: string | null; nickNextAllowed: string | null }> {
  const res = await authFetch(`${API_BASE}/users/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nick, contact }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; nextAllowed?: string };
    if (err.error === "nick_cooldown" && err.nextAllowed) throw new Error(`nick_cooldown:${err.nextAllowed}`);
    throw new Error(err.error ?? "Cannot update");
  }
  return res.json() as Promise<{ nick: string | null; contact: string | null; nickNextAllowed: string | null }>;
}

export async function deleteAccount(): Promise<void> {
  const res = await authFetch(`${API_BASE}/users/me`, { method: "DELETE" });
  if (!res.ok) throw new Error("delete_failed");
}

export interface Announcement {
  id: string;
  message: string;
  type: "info" | "warning" | "alert";
  createdAt: string;
  createdBy: string;
  expiresAt: string | null;
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const res = await fetch(`${API_BASE}/announcements`);
  if (!res.ok) return [];
  return res.json() as Promise<Announcement[]>;
}

export async function adminCreateAnnouncement(message: string, type: Announcement["type"], expiresAt: string | null): Promise<Announcement> {
  const res = await authFetch(`${API_BASE}/admin/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, type, expiresAt }),
  });
  if (!res.ok) throw new Error("create_failed");
  return res.json() as Promise<Announcement>;
}

export async function adminDeleteAnnouncement(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/admin/announcements/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("delete_failed");
}

export interface SiteConfig {
  siteUrl: string;
  siteUrlLocked?: boolean;
  nickCooldownDays: number;
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) throw new Error("fetch_failed");
  return res.json() as Promise<SiteConfig>;
}

export async function adminSaveConfig(patch: Partial<SiteConfig>): Promise<SiteConfig> {
  const res = await authFetch(`${API_BASE}/admin/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("save_failed");
  return res.json() as Promise<SiteConfig>;
}

export async function updateStatus(id: string, status: "active" | "resolved", resolvedAt?: string): Promise<Listing> {
  const res = await authFetch(`${API_BASE}/listings/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, ...(resolvedAt ? { resolvedAt } : {}) }),
  });
  if (!res.ok) throw new Error("Cannot update status");
  return res.json();
}
