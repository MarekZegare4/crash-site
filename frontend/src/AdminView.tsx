import { useEffect, useMemo, useState } from "react";
import { useT } from "./i18n";
import {
  fetchAdminListings,
  fetchAdminUsers,
  fetchAdminReports,
  fetchAdminStats,
  fetchAdminLogs,
  fetchAnnouncements,
  fetchSiteConfig,
  adminUpdateListingStatus,
  adminDeleteListing,
  adminUpdateUserRole,
  adminBanUser,
  adminUpdateReportStatus,
  adminCreateAnnouncement,
  adminDeleteAnnouncement,
  adminSaveConfig,
  type AuthUser,
  type AdminListingView,
  type AdminUserView,
  type AdminReportView,
  type AdminStats,
  type AdminLogEntry,
  type Announcement,
} from "./api";
import AdminListingModal from "./components/AdminListingModal";
import AdminUserModal from "./components/AdminUserModal";

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface Props {
  user: AuthUser;
}

type Tab = "dashboard" | "listings" | "users" | "reports" | "logs" | "announcements" | "config";
type Dir = "asc" | "desc";

function useSortSearch<T>(items: T[], defaultCol: keyof T & string) {
  const [col, setCol] = useState<keyof T & string>(defaultCol);
  const [dir, setDir] = useState<Dir>("desc");
  const [query, setQuery] = useState("");

  function toggle(c: keyof T & string) {
    if (c === col) setDir(d => d === "asc" ? "desc" : "asc");
    else { setCol(c); setDir("asc"); }
  }

  const sorted = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = q
      ? items.filter(r => Object.values(r as object).some(v => String(v ?? "").toLowerCase().includes(q)))
      : items;
    return [...filtered].sort((a, b) => {
      const av = String((a as Record<string, unknown>)[col] ?? "");
      const bv = String((b as Record<string, unknown>)[col] ?? "");
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [items, col, dir, query]);

  return { sorted, col, dir, toggle, query, setQuery };
}

function SortTh<T>({ label, col, active, dir, onClick }: {
  label: string; col: T; active: boolean; dir: Dir; onClick: (c: T) => void;
}) {
  return (
    <th className={`adminThSort${active ? " adminThActive" : ""}`} onClick={() => onClick(col)}>
      {label}
      <span className="adminSortIcon">{active ? (dir === "asc" ? " ↑" : " ↓") : ""}</span>
    </th>
  );
}

export default function AdminView({ user }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [listings, setListings] = useState<AdminListingView[]>([]);
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [reports, setReports] = useState<AdminReportView[]>([]);
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [annMessage, setAnnMessage] = useState("");
  const [annType, setAnnType] = useState<Announcement["type"]>("info");
  const [annExpiresAt, setAnnExpiresAt] = useState("");
  const [annPublishing, setAnnPublishing] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [siteUrlLocked, setSiteUrlLocked] = useState(false);
  const [nickCooldownDays, setNickCooldownDays] = useState(30);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailListing, setDetailListing] = useState<AdminListingView | null>(null);
  const [detailUser, setDetailUser] = useState<AdminUserView | null>(null);

  const [listingTypeFilter, setListingTypeFilter] = useState<"all" | "lost" | "found">("all");
  const [listingStatusFilter, setListingStatusFilter] = useState<"all" | "active" | "resolved">("all");

  const lSort = useSortSearch(listings, "createdAt" as keyof AdminListingView);
  const uSort = useSortSearch(users, "createdAt" as keyof AdminUserView);
  const rSort = useSortSearch(reports, "createdAt" as keyof AdminReportView);

  const pendingCount = reports.filter(r => r.status === "pending").length;

  useEffect(() => {
    if (user.role !== "admin") return;
    setLoading(true);
    Promise.all([fetchAdminListings(), fetchAdminUsers(), fetchAdminReports(), fetchAdminStats(), fetchAdminLogs(), fetchAnnouncements(), fetchSiteConfig()])
      .then(([ls, us, rs, st, lg, anns, cfg]) => { setListings(ls); setUsers(us); setReports(rs); setStats(st); setLogs(lg); setAnnouncements(anns); setSiteUrl(cfg.siteUrl); setSiteUrlLocked(cfg.siteUrlLocked ?? false); setNickCooldownDays(cfg.nickCooldownDays); setError(null); })
      .catch(() => setError(t("admin_loadError")))
      .finally(() => setLoading(false));
  }, []);

  if (user.role !== "admin") {
    return <p className="error" style={{ margin: 24 }}>{t("admin_forbidden")}</p>;
  }

  const handleStatusToggle = async (l: AdminListingView) => {
    const next = l.status === "active" ? "resolved" : "active";
    await adminUpdateListingStatus(l.id, next);
    setListings(prev => prev.map(x => x.id === l.id ? { ...x, status: next } : x));
    setDetailListing(prev => prev?.id === l.id ? { ...prev, status: next } : prev);
    refreshLogs();
  };

  const handleDeleteListing = async (l: AdminListingView) => {
    if (pendingDeleteId !== l.id) { setPendingDeleteId(l.id); setTimeout(() => setPendingDeleteId(null), 3000); return; }
    setPendingDeleteId(null);
    await adminDeleteListing(l.id);
    setListings(prev => prev.filter(x => x.id !== l.id));
    setDetailListing(null);
    refreshLogs();
  };

  const refreshLogs = () => {
    fetchAdminLogs().then(setLogs).catch(() => {});
  };

  const handleOpenListingFromUser = (listingId: string) => {
    const l = listings.find(x => x.id === listingId);
    if (l) {
      setTab("listings");
      setDetailListing(l);
    }
  };

  const handleRoleToggle = async (u: AdminUserView) => {
    const next = u.role === "admin" ? "user" : "admin";
    await adminUpdateUserRole(u.id, next);
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: next } : x));
    setDetailUser(prev => prev?.id === u.id ? { ...prev, role: next } : prev);
    refreshLogs();
  };

  const handleBanToggle = async (id: string, banned: boolean) => {
    await adminBanUser(id, banned);
    setUsers(prev => prev.map(x => x.id === id ? { ...x, banned } : x));
    setDetailUser(prev => prev?.id === id ? { ...prev, banned } : prev);
    refreshLogs();
  };

  const handleDismissReport = async (r: AdminReportView) => {
    await adminUpdateReportStatus(r.id, "dismissed");
    setReports(prev => prev.map(x => x.id === r.id ? { ...x, status: "dismissed" as const } : x));
    refreshLogs();
  };

  const handleDeleteListingFromReport = async (r: AdminReportView) => {
    if (pendingDeleteId !== r.id) { setPendingDeleteId(r.id); setTimeout(() => setPendingDeleteId(null), 3000); return; }
    setPendingDeleteId(null);
    try { await adminDeleteListing(r.listingId); } catch { /* already deleted — still mark report acted */ }
    await adminUpdateReportStatus(r.id, "acted");
    setListings(prev => prev.filter(x => x.id !== r.listingId));
    setReports(prev => prev.map(x => x.listingId === r.listingId ? { ...x, status: "acted" as const } : x));
    refreshLogs();
  };

  const handlePublishAnnouncement = async () => {
    if (!annMessage.trim()) return;
    setAnnPublishing(true);
    try {
      const expiresAt = annExpiresAt ? new Date(annExpiresAt).toISOString() : null;
      const ann = await adminCreateAnnouncement(annMessage.trim(), annType, expiresAt);
      setAnnouncements(prev => [ann, ...prev]);
      setAnnMessage("");
      setAnnExpiresAt("");
    } finally {
      setAnnPublishing(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    await adminDeleteAnnouncement(id);
    setAnnouncements(prev => prev.filter(a => a.id !== id));
  };

  const handleSaveConfig = async () => {
    setConfigSaving(true);
    setConfigError(null);
    try {
      const saved = await adminSaveConfig({ ...(!siteUrlLocked && { siteUrl: siteUrl.trim() }), nickCooldownDays });
      setSiteUrl(saved.siteUrl);
      setNickCooldownDays(saved.nickCooldownDays);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    } catch {
      setConfigError(t("admin_configSaveError"));
    } finally {
      setConfigSaving(false);
    }
  };

  const filteredListings = useMemo(() => lSort.sorted.filter(l => {
    if (listingTypeFilter !== "all" && l.type !== listingTypeFilter) return false;
    if (listingStatusFilter !== "all" && l.status !== listingStatusFilter) return false;
    return true;
  }), [lSort.sorted, listingTypeFilter, listingStatusFilter]);

  const activeSort = tab === "listings" ? lSort : tab === "users" ? uSort : rSort;

  return (
    <div className="adminView">
      <div className="adminTabBar">
        <div className="adminTabs">
          <button className={`adminTab${tab === "dashboard" ? " adminTabActive" : ""}`} onClick={() => setTab("dashboard")}>
            {t("admin_dashboard")}
          </button>
          <button className={`adminTab${tab === "listings" ? " adminTabActive" : ""}`} onClick={() => setTab("listings")}>
            {t("admin_listings")} · {listings.length}
          </button>
          <button className={`adminTab${tab === "users" ? " adminTabActive" : ""}`} onClick={() => setTab("users")}>
            {t("admin_users")} · {users.length}
          </button>
          <button className={`adminTab${tab === "reports" ? " adminTabActive" : ""}`} onClick={() => setTab("reports")}>
            {t("admin_reports")}{pendingCount > 0 && <span className="adminReportsBadge">{pendingCount}</span>}
          </button>
          <button className={`adminTab${tab === "logs" ? " adminTabActive" : ""}`} onClick={() => setTab("logs")}>
            {t("admin_logs")}
          </button>
          <button className={`adminTab${tab === "announcements" ? " adminTabActive" : ""}`} onClick={() => setTab("announcements")}>
            {t("admin_announcements")}{announcements.length > 0 && <span className="adminReportsBadge">{announcements.length}</span>}
          </button>
          <button className={`adminTab${tab === "config" ? " adminTabActive" : ""}`} onClick={() => setTab("config")}>
            {t("admin_config")}
          </button>
        </div>
        {(tab === "listings" || tab === "users" || tab === "reports") && (
          <input
            className="adminSearch"
            placeholder={t("admin_search")}
            value={activeSort.query}
            onChange={e => activeSort.setQuery(e.target.value)}
          />
        )}
      </div>

      {error && <p className="error" style={{ margin: "12px 16px" }}>{error}</p>}

      {loading ? (
        <p className="adminLoading">…</p>
      ) : tab === "dashboard" ? (
        <div className="adminDash">
          <section className="adminDashSection">
            <h2 className="adminDashTitle">{t("admin_listings")}</h2>
            <div className="adminDashRow">
              <div className="adminStatCard">
                <span className="adminStatVal">{stats?.listings.total ?? 0}</span>
                <span className="adminStatLbl">{t("admin_statTotal")}</span>
              </div>
              <div className="adminStatCard adminStatCard--accent">
                <span className="adminStatVal">{stats?.listings.active ?? 0}</span>
                <span className="adminStatLbl">{t("admin_statActive")}</span>
              </div>
              <div className="adminStatCard">
                <span className="adminStatVal">{stats?.listings.resolved ?? 0}</span>
                <span className="adminStatLbl">{t("admin_statResolved")}</span>
              </div>
              <div className="adminStatCard adminStatCard--lost">
                <span className="adminStatVal">{stats?.listings.lost ?? 0}</span>
                <span className="adminStatLbl">{t("admin_statLost")}</span>
              </div>
              <div className="adminStatCard adminStatCard--found">
                <span className="adminStatVal">{stats?.listings.found ?? 0}</span>
                <span className="adminStatLbl">{t("admin_statFound")}</span>
              </div>
            </div>
          </section>

          <section className="adminDashSection">
            <h2 className="adminDashTitle">{t("admin_users")}</h2>
            <div className="adminDashRow">
              <div className="adminStatCard">
                <span className="adminStatVal">{stats?.users.total ?? 0}</span>
                <span className="adminStatLbl">{t("admin_statTotal")}</span>
              </div>
              <div className="adminStatCard adminStatCard--accent">
                <span className="adminStatVal">{stats?.users.newLast7d ?? 0}</span>
                <span className="adminStatLbl">{t("admin_statNew7d")}</span>
              </div>
              <div className="adminStatCard">
                <span className="adminStatVal">{stats?.users.newLast30d ?? 0}</span>
                <span className="adminStatLbl">{t("admin_statNew30d")}</span>
              </div>
            </div>
          </section>

          <section className="adminDashSection">
            <h2 className="adminDashTitle">{t("admin_reports")}</h2>
            <div className="adminDashRow">
              <div className="adminStatCard">
                <span className="adminStatVal">{stats?.reports.total ?? 0}</span>
                <span className="adminStatLbl">{t("admin_statTotal")}</span>
              </div>
              {(stats?.reports.pending ?? 0) > 0 ? (
                <div className="adminStatCard adminStatCard--danger">
                  <span className="adminStatVal">{stats?.reports.pending ?? 0}</span>
                  <span className="adminStatLbl">{t("admin_reportPending")}</span>
                </div>
              ) : (
                <div className="adminStatCard adminStatCard--ok">
                  <span className="adminStatVal">0</span>
                  <span className="adminStatLbl">{t("admin_reportPending")}</span>
                </div>
              )}
              <div className="adminStatCard">
                <span className="adminStatVal">{stats?.reports.dismissed ?? 0}</span>
                <span className="adminStatLbl">{t("admin_reportDismissed")}</span>
              </div>
              <div className="adminStatCard">
                <span className="adminStatVal">{stats?.reports.acted ?? 0}</span>
                <span className="adminStatLbl">{t("admin_reportActed")}</span>
              </div>
            </div>
          </section>

          <section className="adminDashSection">
            <h2 className="adminDashTitle">{t("admin_system")}</h2>
            <div className="adminDashRow">
              <div className="adminStatCard adminStatCard--accent">
                <span className="adminStatVal mono">{stats ? fmtBytes(stats.dbSize + stats.uploadsSize) : "—"}</span>
                <span className="adminStatLbl">{t("admin_statTotal")}</span>
              </div>
              <div className="adminStatCard">
                <span className="adminStatVal mono">{stats ? fmtBytes(stats.dbSize) : "—"}</span>
                <span className="adminStatLbl">{t("admin_statDbSize")}</span>
              </div>
              <div className="adminStatCard">
                <span className="adminStatVal mono">{stats ? fmtBytes(stats.uploadsSize) : "—"}</span>
                <span className="adminStatLbl">{t("admin_statUploads")}</span>
              </div>
            </div>
          </section>
        </div>
      ) : tab === "listings" ? (
        <div className="adminTable">
          <div className="adminFilterBar">
            <div className="mcGroup">
              {(["all", "lost", "found"] as const).map(v => (
                <button key={v} className={`mcMode${listingTypeFilter === v ? " mcModeActive" : ""}`} onClick={() => setListingTypeFilter(v)}>
                  {v === "all" ? t("feed_all") : v === "lost" ? t("feed_lost") : t("feed_found")}
                </button>
              ))}
            </div>
            <div className="mcGroup">
              {(["all", "active", "resolved"] as const).map(v => (
                <button key={v} className={`mcMode${listingStatusFilter === v ? " mcModeActive" : ""}`} onClick={() => setListingStatusFilter(v)}>
                  {v === "all" ? t("feed_all") : v === "active" ? t("admin_statActive") : t("admin_statResolved")}
                </button>
              ))}
            </div>
            <span className="adminFilterCount">{filteredListings.length} / {listings.length}</span>
          </div>
          <table>
            <thead>
              <tr>
                <SortTh label={t("admin_nick")} col={"nickname" as keyof AdminListingView} active={lSort.col === "nickname"} dir={lSort.dir} onClick={lSort.toggle} />
                <SortTh label={t("admin_type")} col={"type" as keyof AdminListingView} active={lSort.col === "type"} dir={lSort.dir} onClick={lSort.toggle} />
                <SortTh label={t("admin_status")} col={"status" as keyof AdminListingView} active={lSort.col === "status"} dir={lSort.dir} onClick={lSort.toggle} />
                <SortTh label={t("admin_public")} col={"isPublic" as keyof AdminListingView} active={lSort.col === "isPublic"} dir={lSort.dir} onClick={lSort.toggle} />
                <SortTh label={t("admin_date")} col={"createdAt" as keyof AdminListingView} active={lSort.col === "createdAt"} dir={lSort.dir} onClick={lSort.toggle} />
                <th>{t("admin_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredListings.map(l => (
                <tr key={l.id} className="adminRowClickable" onClick={() => setDetailListing(l)}>
                  <td className="mono" title={l.id}>{l.nickname}</td>
                  <td><span className={`badge badge--${l.type}`}>{l.type}</span></td>
                  <td><span className={`badge badge--${l.status}`}>{l.status}</span></td>
                  <td>
                    {l.isPublic
                      ? <span className="badge badge--active">{t("admin_visPublic")}</span>
                      : <span className="badge badge--resolved">{t("admin_visPrivate")}</span>
                    }
                  </td>
                  <td className="mono adminDateCell">{l.createdAt.slice(0, 10)}</td>
                  <td className="adminActions" onClick={e => e.stopPropagation()}>
                    <div className="adminActionsRow">
                      <button className="adminActBtn" onClick={() => void handleStatusToggle(l)}>
                        {l.status === "active" ? t("admin_setResolved") : t("admin_setActive")}
                      </button>
                      <button className="adminActBtn adminActDanger" onClick={() => void handleDeleteListing(l)}>
                        {pendingDeleteId === l.id ? t("admin_confirmDeleteYes") : t("admin_delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "users" ? (
        <div className="adminTable">
          <table>
            <thead>
              <tr>
                <SortTh label={t("admin_displayName")} col={"displayName" as keyof AdminUserView} active={uSort.col === "displayName"} dir={uSort.dir} onClick={uSort.toggle} />
                <SortTh label={t("admin_provider")} col={"provider" as keyof AdminUserView} active={uSort.col === "provider"} dir={uSort.dir} onClick={uSort.toggle} />
                <SortTh label={t("admin_nick")} col={"nick" as keyof AdminUserView} active={uSort.col === "nick"} dir={uSort.dir} onClick={uSort.toggle} />
                <SortTh label={t("admin_role")} col={"role" as keyof AdminUserView} active={uSort.col === "role"} dir={uSort.dir} onClick={uSort.toggle} />
                <SortTh label={t("admin_nickChangedAt")} col={"nickChangedAt" as keyof AdminUserView} active={uSort.col === "nickChangedAt"} dir={uSort.dir} onClick={uSort.toggle} />
                <SortTh label={t("admin_date")} col={"createdAt" as keyof AdminUserView} active={uSort.col === "createdAt"} dir={uSort.dir} onClick={uSort.toggle} />
                <th>{t("admin_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {uSort.sorted.map(u => (
                <tr key={u.id} className="adminRowClickable" onClick={() => setDetailUser(u)}>
                  <td title={u.id}>{u.displayName}</td>
                  <td><span className={`badge badge--${u.provider}`}>{u.provider}</span></td>
                  <td className="mono">{u.nick ?? <span style={{ opacity: 0.35 }}>—</span>}</td>
                  <td>
                    <span className={`badge badge--${u.role}`}>{u.role}</span>
                    {u.banned && <span className="badge badge--banned" style={{ marginLeft: 4 }}>{t("admin_banned")}</span>}
                  </td>
                  <td className="mono adminDateCell">{u.nickChangedAt ? u.nickChangedAt.slice(0, 10) : <span style={{ opacity: 0.35 }}>—</span>}</td>
                  <td className="mono adminDateCell">{u.createdAt.slice(0, 10)}</td>
                  <td className="adminActions" onClick={e => e.stopPropagation()}>
                    <div className="adminActionsRow">
                      <button className="adminActBtn" onClick={() => void handleRoleToggle(u)}>
                        {u.role === "admin" ? t("admin_makeUser") : t("admin_makeAdmin")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "reports" ? (
        <div className="adminTable">
          <table>
            <thead>
              <tr>
                <SortTh label={t("admin_reportListing")} col={"listingNick" as keyof AdminReportView} active={rSort.col === "listingNick"} dir={rSort.dir} onClick={rSort.toggle} />
                <SortTh label={t("admin_reportReason")} col={"reason" as keyof AdminReportView} active={rSort.col === "reason"} dir={rSort.dir} onClick={rSort.toggle} />
                <th>{t("admin_reportComment")}</th>
                <SortTh label={t("admin_date")} col={"createdAt" as keyof AdminReportView} active={rSort.col === "createdAt"} dir={rSort.dir} onClick={rSort.toggle} />
                <SortTh label={t("admin_status")} col={"status" as keyof AdminReportView} active={rSort.col === "status"} dir={rSort.dir} onClick={rSort.toggle} />
                <th>{t("admin_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rSort.sorted.map(r => {
                const reasonKey = ({
                  inappropriate_photo: "report_reasonPhoto",
                  vulgar_text: "report_reasonText",
                  spam: "report_reasonSpam",
                  other: "report_reasonOther",
                } as Record<string, string>)[r.reason] ?? "report_reasonOther";
                const reasonBadge = ({
                  inappropriate_photo: "badge--report-warn",
                  vulgar_text: "badge--report-danger",
                  spam: "badge--report-danger",
                  other: "badge--report-other",
                } as Record<string, string>)[r.reason] ?? "badge--report-other";
                return (
                  <tr key={r.id} className={r.status !== "pending" ? "adminRowDimmed" : ""}>
                    <td className="adminReportNick" title={r.listingId}>{r.listingNick}</td>
                    <td><span className={`badge ${reasonBadge}`}>{t(reasonKey as never)}</span></td>
                    <td className="adminCommentCell" title={r.comment ?? ""}>{r.comment ?? <span style={{ opacity: 0.3 }}>—</span>}</td>
                    <td className="mono adminDateCell">{r.createdAt.slice(0, 10)}</td>
                    <td>
                      <span className={`badge badge--report-${r.status}`}>
                        {t(`admin_report${r.status.charAt(0).toUpperCase() + r.status.slice(1)}` as never)}
                      </span>
                    </td>
                    <td className="adminActions">
                      {r.status === "pending" && (
                        <div className="adminActionsRow">
                          <button className="adminActBtn" onClick={() => void handleDismissReport(r)}>
                            {t("admin_reportDismiss")}
                          </button>
                          <button className="adminActBtn adminActDanger" onClick={() => void handleDeleteListingFromReport(r)}>
                            {pendingDeleteId === r.id ? t("admin_confirmDeleteYes") : t("admin_reportDeleteListing")}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : tab === "logs" ? (
        <div className="adminTable">
          {logs.length === 0 ? (
            <p style={{ padding: "32px 20px", opacity: 0.4 }}>{t("admin_logNoEntries")}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("admin_date")}</th>
                  <th>{t("admin_logAdmin")}</th>
                  <th>{t("admin_logAction")}</th>
                  <th>{t("admin_logTarget")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td className="mono adminDateCell">{l.createdAt.slice(0, 16).replace("T", " ")}</td>
                    <td>{l.adminName}</td>
                    <td><span className="adminLogAction">{l.action.replace(/_/g, " ")}</span></td>
                    <td className="mono" style={{ fontSize: 11, opacity: 0.6 }}>
                      {l.targetType} · {l.targetId.slice(0, 8)}
                      {l.details && Object.keys(l.details).length > 0 && (
                        <span style={{ opacity: 0.7, marginLeft: 6 }}>
                          ({Object.values(l.details).filter(Boolean).join(", ")})
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {tab === "announcements" && (
        <div className="adminContent">
          <div className="adminAnnForm">
            <textarea
              className="adminAnnTextarea"
              placeholder={t("admin_annMessage")}
              value={annMessage}
              onChange={e => setAnnMessage(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <div className="adminAnnControls">
              <div className="mcGroup">
                {(["info", "warning", "alert"] as const).map(type => (
                  <button
                    key={type}
                    className={`mcMode${annType === type ? " mcModeActive" : ""}`}
                    onClick={() => setAnnType(type)}
                  >
                    {t(`admin_annType${type.charAt(0).toUpperCase() + type.slice(1)}` as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
              <label className="adminAnnExpiryRow">
                <span className="adminAnnExpiryLabel">{t("admin_annExpiresAt")}</span>
                <input
                  type="datetime-local"
                  className="adminAnnExpiryInput"
                  value={annExpiresAt}
                  onChange={e => setAnnExpiresAt(e.target.value)}
                />
              </label>
              <button
                className="primaryBtn"
                onClick={() => void handlePublishAnnouncement()}
                disabled={annPublishing || !annMessage.trim()}
              >
                {annPublishing ? t("admin_annPublishing") : t("admin_annPublish")}
              </button>
            </div>
          </div>

          {announcements.length === 0 ? (
            <p className="adminEmptyMsg">{t("admin_annEmpty")}</p>
          ) : (
            <div className="adminAnnList">
              {announcements.map(ann => (
                <div key={ann.id} className={`adminAnnRow adminAnnRow--${ann.type}`}>
                  <span className={`adminAnnTypePill adminAnnTypePill--${ann.type}`}>{ann.type}</span>
                  <span className="adminAnnMsg">{ann.message}</span>
                  <span className="adminAnnDate mono">{ann.createdAt.slice(0, 16).replace("T", " ")}</span>
                  {ann.expiresAt && (
                    <span className="adminAnnExpiry mono">→ {ann.expiresAt.slice(0, 16).replace("T", " ")}</span>
                  )}
                  <div className="adminAnnActions">
                    <button className="adminActBtn" onClick={() => { setAnnMessage(ann.message); setAnnType(ann.type); }}>
                      {t("admin_annRepush")}
                    </button>
                    <button className="adminActBtn adminActDanger" onClick={() => void handleDeleteAnnouncement(ann.id)}>
                      {t("admin_annDelete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "config" && (
        <div className="adminContent">
          <div className="adminConfigSection">
            <h3 className="adminConfigTitle">{t("admin_configSiteUrl")}</h3>
            <p className="adminConfigDesc">{t("admin_configSiteUrlDesc")}</p>
            <div className="adminConfigRow">
              <input
                className="adminConfigInput"
                type="url"
                value={siteUrl}
                onChange={e => { setSiteUrl(e.target.value); setConfigSaved(false); setConfigError(null); }}
                placeholder="https://example.com"
                disabled={siteUrlLocked}
              />
              {siteUrlLocked && (
                <span className="adminConfigLocked">{t("admin_configSiteUrlLocked")}</span>
              )}
            </div>

            <h3 className="adminConfigTitle" style={{ marginTop: 20 }}>{t("admin_configNickCooldown")}</h3>
            <p className="adminConfigDesc">{t("admin_configNickCooldownDesc")}</p>
            <div className="adminConfigRow">
              <input
                className="adminConfigInput"
                type="number"
                min={0}
                max={365}
                value={nickCooldownDays}
                onChange={e => { setNickCooldownDays(Number(e.target.value)); setConfigSaved(false); setConfigError(null); }}
                style={{ maxWidth: 100 }}
              />
              <span className="adminConfigDesc" style={{ margin: 0, alignSelf: "center" }}>{t("admin_configDays")}</span>
            </div>

            <button
              className="primaryBtn"
              style={{ marginTop: 16 }}
              onClick={() => void handleSaveConfig()}
              disabled={configSaving}
            >
              {configSaved ? t("account_saved") : configSaving ? t("account_saving") : t("account_save")}
            </button>
            {configError && <p className="error" style={{ margin: "8px 0 0" }}>{configError}</p>}
          </div>
        </div>
      )}

      {detailListing && (
        <AdminListingModal
          
          listing={detailListing}
          onClose={() => setDetailListing(null)}
          onStatusChange={(id, status) => {
            setListings(prev => prev.map(x => x.id === id ? { ...x, status } : x));
            setDetailListing(prev => prev?.id === id ? { ...prev, status } : prev);
          }}
          onDeleted={(id) => {
            setListings(prev => prev.filter(x => x.id !== id));
            setDetailListing(null);
          }}
        />
      )}

      {detailUser && (
        <AdminUserModal
          user={detailUser}
          
          onClose={() => setDetailUser(null)}
          onSelectListing={handleOpenListingFromUser}
          onBanToggle={handleBanToggle}
          onUserUpdated={(patch) => {
            setUsers(prev => prev.map(u => u.id === detailUser.id ? { ...u, ...patch } : u));
            setDetailUser(prev => prev ? { ...prev, ...patch } : prev);
          }}
        />
      )}
    </div>
  );
}
