import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";
import { deleteListing, editListing, fetchAuthMe, fetchListingById, fetchListings, fetchMyListings, fetchPrivateListing, fetchProviders, fetchSiteConfig, fetchStats, listingImgUrl, logout as apiLogout, mockSocialLogin, setOnUnauthorized, updateStatus } from "./api";
import type { Announcement } from "./api";
import type { AuthUser } from "./api";
import AccountSettingsPanel from "./components/AccountSettingsPanel";
import AnnouncementBanner from "./components/AnnouncementBanner";
import CopyLinkPill from "./components/CopyLinkPill";
import EditListingForm from "./components/EditListingForm";
import HelpModal from "./components/HelpModal";
import NickSetupModal from "./components/NickSetupModal";
import PhotoLightbox from "./components/PhotoLightbox";
import ReportModal from "./components/ReportModal";
import StickerModal from "./components/StickerModal";
import ListingFeed from "./components/ListingFeed";
import ListingForm from "./components/ListingForm";
import MapView from "./components/MapView";
import { avatarUrl, formatDate, setSiteOrigin, siteOrigin } from "./utils";
import { useLang, useT } from "./i18n";
import type { Listing, ListingStats } from "./types";

type Page = "mapa" | "ustawienia" | "zgloszenia" | "dodawanie" | "logowanie" | "edycja";
type MapMode = "light" | "dark" | "sat";


function getShareUrl(listing: Listing): string {
  if (!listing.isPublic && listing.privateToken) {
    return `${siteOrigin()}/private/${listing.privateToken}`;
  }
  return `${siteOrigin()}/?listing=${listing.id}`;
}

function formatPrivateLink(token?: string): string | null {
  if (!token) return null;
  return `${siteOrigin()}/private/${token}`;
}


function pageIcon(page: Page | "admin", className = "panelIcon"): React.ReactElement {
  switch (page) {
    case "mapa":
      return <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2C5.79 2 4 3.79 4 6c0 3.25 4 8 4 8s4-4.75 4-8c0-2.21-1.79-4-4-4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2"/></svg>;
    case "dodawanie":
      return <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
    case "logowanie":
      return <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M2.5 14c0-3.038 2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
    case "ustawienia":
      return <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.6 3.6l.85.85M11.55 11.55l.85.85M3.6 12.4l.85-.85M11.55 4.45l.85-.85" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
    case "zgloszenia":
      return <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 4h8M5 8h8M5 12h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="2.5" cy="4" r="1" fill="currentColor"/><circle cx="2.5" cy="8" r="1" fill="currentColor"/><circle cx="2.5" cy="12" r="1" fill="currentColor"/></svg>;
    case "edycja":
      return <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10.5 2.5l3 3-7.5 7.5L3 14l.5-3 7.5-7.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M9 4l3 3" stroke="currentColor" strokeWidth="1.4"/></svg>;
    case "admin":
      return <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2L3 4.5v4c0 3 2.5 5 5 5s5-2 5-5v-4L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>;
  }
}

function getListingToneClass(listing: Listing): string {
  return listing.type === "lost" && listing.status === "active" ? "statusLost" : "statusFound";
}

export default function App() {
  const t = useT();
  const { lang, setLang } = useLang();

  const [listings, setListings] = useState<Listing[]>([]);
  const [stats, setStats] = useState<ListingStats>({ total: 0, active: 0, resolved: 0 });
  const [networkError, setNetworkError] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [lastPrivateLink, setLastPrivateLink] = useState<string | null>(
    () => window.localStorage.getItem("crashsite.lastPrivateLink")
  );
  const [selectedPoint, setSelectedPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [userNick, setUserNick] = useState(() => window.localStorage.getItem("crashsite.defaultNick") ?? "");
  const [userContact, setUserContact] = useState(() => window.localStorage.getItem("crashsite.defaultContact") ?? "");
  const [activePage, setActivePage] = useState<Page>("mapa");
  const [menuOpen, setMenuOpen] = useState(false);
  const [listingFilter, setListingFilter] = useState<"all" | "lost" | "found">("all");
  const [listingQuery, setListingQuery] = useState("");
  const [mapMode, setMapMode] = useState<MapMode>(() => {
    const saved = window.localStorage.getItem("crashsite.mapMode");
    return (saved === "dark" || saved === "sat") ? saved : "light";
  });
  const setMapModeAndSave = (mode: MapMode) => {
    setMapMode(mode);
    window.localStorage.setItem("crashsite.mapMode", mode);
  };
  const [hoverListing, setHoverListing] = useState<Listing | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [providers, setProviders] = useState<string[]>([]);
  const [areaMode, setAreaMode] = useState<"point" | "circle" | "polygon">("point");
  const [circleRadius, setCircleRadius] = useState(500);
  const [polygonPoints, setPolygonPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [polygonFinished, setPolygonFinished] = useState(false);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [mobileFeedOpen, setMobileFeedOpen] = useState(false);
  const [sheetMinimized, setSheetMinimized] = useState(false);
  const [mapModeMenuOpen, setMapModeMenuOpen] = useState(false);
  const [geoState, setGeoState] = useState<"idle" | "loading" | "error">("idle");
  const [detailPhotoIndex, setDetailPhotoIndex] = useState(0);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [reportListingId, setReportListingId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [resolveModalId, setResolveModalId] = useState<string | null>(null);
  const [resolveDate, setResolveDate] = useState("");
  const [restorePickerId, setRestorePickerId] = useState<string | null>(null);
  const [restoreAnchorRect, setRestoreAnchorRect] = useState<DOMRect | null>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const pendingFlyToRef = useRef<[number, number] | null>(null);
  const ovLeftRef = useRef<HTMLElement>(null);
  const sheetDragStartY = useRef<number | null>(null);
  const ovRightRef = useRef<HTMLElement>(null);
  const feedDragStartY = useRef<number | null>(null);
  const topbarGroupRef = useRef<HTMLDivElement>(null);

  const kindLabel = (l: Listing) =>
    l.type === "lost" && l.status === "active" ? t("kind_lost") : t("kind_found");

  const isExpired = (l: Listing) => !!(l.expiresAt && new Date(l.expiresAt) < new Date());

  useEffect(() => {
    setOnUnauthorized(logout);
    return () => setOnUnauthorized(() => {});
  }, []);

  useEffect(() => {
    void fetchProviders().then(setProviders);

    // Handle ?auth_error= from OAuth redirect
    const params = new URLSearchParams(window.location.search);
    const urlAuthError = params.get("auth_error");
    if (urlAuthError) {
      window.history.replaceState({}, "", window.location.pathname);
      setAuthError(t("auth_error"));
      setActivePage("logowanie");
    }

    void fetchAuthMe()
      .then(async (user) => {
        setDisplayName(user.displayName);
        setCurrentUser(user);
        if (!userNick) setUserNick(user.nick ?? user.displayName);
        if (!userContact && user.contact) setUserContact(user.contact);
        if (!window.localStorage.getItem("crashsite.helpSeen")) setShowHelp(true);
        const mine = await fetchMyListings();
        setMyListings(mine);
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    window.localStorage.setItem("crashsite.defaultNick", userNick);
    window.localStorage.setItem("crashsite.defaultContact", userContact);
  }, [userNick, userContact]);

  function openHelp() { setShowHelp(true); }
  function closeHelp() {
    setShowHelp(false);
    window.localStorage.setItem("crashsite.helpSeen", "1");
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as Element).tagName;
      if (e.key.toLowerCase() === "h" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        setShowHelp((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function refresh(publicOnly = false): Promise<Listing[]> {
    try {
      const [nextListings, nextStats] = await Promise.all([fetchListings(), fetchStats()]);
      setListings(nextListings);
      setStats(nextStats);
      setNetworkError(false);
      if (!publicOnly && currentUser) {
        const mine = await fetchMyListings();
        setMyListings(mine);
      }
      return nextListings;
    } catch {
      setNetworkError(true);
      return [];
    }
  }

  useEffect(() => {
    void fetchSiteConfig().then(cfg => { if (cfg.siteUrl) setSiteOrigin(cfg.siteUrl); });

    const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000/api";
    const source = new EventSource(`${apiBase}/announcements/stream`, { withCredentials: true });
    source.onmessage = (e: MessageEvent<string>) => {
      try { setAnnouncements(JSON.parse(e.data) as Announcement[]); } catch { /* malformed event */ }
    };
    return () => source.close();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autoId = params.get("listing");
    if (autoId) window.history.replaceState({}, "", window.location.pathname);
    void refresh().then((loaded) => {
      if (!autoId) return;
      const target = loaded.find((l) => l.id === autoId);
      if (!target) return;
      setSelectedListing(target);
      setSelectedPoint({ latitude: target.latitude, longitude: target.longitude });
      if (mapRef.current) {
        mapRef.current.flyTo({ center: [target.longitude, target.latitude], zoom: 15, duration: 800 });
      } else {
        pendingFlyToRef.current = [target.latitude, target.longitude];
      }
    });
  }, []);

  useEffect(() => {
    const match = window.location.pathname.match(/^\/private\/([^/]+)$/);
    if (!match) return;
    void fetchPrivateListing(match[1]).then((listing) => {
      setSelectedListing(listing);
      setSelectedPoint({ latitude: listing.latitude, longitude: listing.longitude });
      if (mapRef.current) {
        mapRef.current.flyTo({ center: [listing.longitude, listing.latitude], zoom: 15, duration: 800 });
      } else {
        pendingFlyToRef.current = [listing.latitude, listing.longitude];
      }
    }).catch(() => { /* invalid or expired token — show app normally */ });
  }, []);

  useEffect(() => { setSheetMinimized(false); }, [activePage]);

  const dismissSheetRef = useRef<() => void>(() => {});
  useEffect(() => {
    function onPopState() { dismissSheetRef.current(); }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!restorePickerId) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if ((e.target as Element).closest?.(".restoreMenu")) return;
      setRestorePickerId(null);
      setRestoreAnchorRect(null);
    }
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, [restorePickerId]);

  useEffect(() => {
    const el = topbarGroupRef.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty("--topbar-h", `${el.offsetHeight}px`);
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const privateListingIds = useMemo(
    () => new Set(myListings.filter((l) => !l.isPublic).map((l) => l.id)),
    [myListings]
  );

  const visibleListings = useMemo(() => {
    const privateOwn = myListings.filter(
      (l) => !l.isPublic && !listings.some((p) => p.id === l.id)
    );
    const seen = new Set<string>();
    const all = [...listings, ...privateOwn].filter((l) => {
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return !isExpired(l);
    });
    const filtered = all.filter((listing) => {
      if (listingFilter === "lost" && !(listing.type === "lost" && listing.status === "active")) return false;
      if (listingFilter === "found" && !(listing.type === "found" || listing.status === "resolved")) return false;
      if (!listingQuery.trim()) return true;
      const search = listingQuery.trim().toLowerCase();
      return [listing.id, listing.nickname, listing.title, listing.description, listing.reward]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(search));
    });
    return filtered;
  }, [listingFilter, listingQuery, listings, myListings]);

  const ownedListingIds = useMemo(() => new Set(myListings.map((l) => l.id)), [myListings]);


  function loginWithOAuth(provider: string) {
    const base = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000/api";
    window.location.href = `${base}/auth/${provider}`;
  }

  async function loginWithMock() {
    const user = await mockSocialLogin();
    setDisplayName(user.displayName);
    setCurrentUser(user);
    if (!userNick) setUserNick(user.nick ?? user.displayName);
    if (!userContact && user.contact) setUserContact(user.contact);
    if (!window.localStorage.getItem("crashsite.helpSeen")) setShowHelp(true);
    const mine = await fetchMyListings();
    setMyListings(mine);
    setActivePage("mapa");
  }

  async function logout() {
    await apiLogout().catch(() => {});
    setDisplayName(null);
    setCurrentUser(null);
    setMyListings([]);
    setActivePage("mapa");
  }

  async function handleRestore(id: string, preset: "7d" | "14d" | "30d" | "90d" | "never") {
    const days = { "7d": 7, "14d": 14, "30d": 30, "90d": 90, "never": 0 }[preset];
    const expiresAt = preset === "never" ? null : new Date(Date.now() + days * 86_400_000).toISOString();
    const updated = await editListing(id, { expiresAt });
    setMyListings((prev) => prev.map((l) => l.id === id ? updated : l));
    setRestorePickerId(null);
    await refresh();
  }

  async function markResolved(id: string, resolvedAt?: string) {
    const updated = await updateStatus(id, "resolved", resolvedAt || undefined);
    setSelectedListing(updated);
    setListings((prev) => prev.map((l) => l.id === id ? updated : l));
    setStats((prev) => ({ ...prev, active: Math.max(0, prev.active - 1), resolved: prev.resolved + 1 }));
    setResolveModalId(null);
    setResolveDate("");
    void refresh();
  }


  async function handleDelete(id: string) {
    if (!window.confirm(t("detail_confirmDelete"))) return;
    await deleteListing(id);
    setListings((prev) => prev.filter((l) => l.id !== id));
    setMyListings((prev) => prev.filter((l) => l.id !== id));
    if (selectedListing?.id === id) setSelectedListing(null);
  }

  const handleSelectListing = useCallback((listing: Listing) => {
    setDetailPhotoIndex(0);
    setSelectedListing(listing);
    setSelectedPoint({ latitude: listing.latitude, longitude: listing.longitude });
    setHoverListing(null);
    setActivePage("mapa");
    setMobileFeedOpen(false);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [listing.longitude, listing.latitude], zoom: 15, duration: 800 });
    } else {
      pendingFlyToRef.current = [listing.latitude, listing.longitude];
    }
    fetchListingById(listing.id).then((full) => {
      setSelectedListing(full);
      setListings((prev) => prev.map((l) => l.id === full.id ? { ...l, ...full } : l));
    }).catch(() => { /* keep summary data on error */ });
  }, []);


  function selectPage(page: Exclude<Page, "mapa">) {
    setActivePage(page);
    setMenuOpen(false);
  }

  function openLoginScreen() {
    setActivePage("logowanie");
    setMenuOpen(false);
  }

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
    if (pendingFlyToRef.current) {
      const [lat, lng] = pendingFlyToRef.current;
      map.flyTo({ center: [lng, lat], zoom: 15, duration: 800 });
      pendingFlyToRef.current = null;
    }
  }, []);

  const handleListingHover = useCallback((listing: Listing) => {
    setHoverListing(listing);
  }, []);

  const handleListingLeave = useCallback(() => {
    setHoverListing(null);
  }, []);

  const currentSelection = selectedListing;
  const currentSelectionOwned = currentSelection ? ownedListingIds.has(currentSelection.id) : false;
  const activeListCount = listings.filter((l) => l.status === "active").length;
  const locale = t("date_locale");

  function dismissSheet() {
    if (activePage !== "mapa") {
      setActivePage("mapa");
    } else if (currentSelection) {
      setSelectedListing(null);
      setSelectedPoint(null);
    }
  }

  function handleSheetDragStart(e: React.TouchEvent) {
    sheetDragStartY.current = e.touches[0].clientY;
    if (ovLeftRef.current) ovLeftRef.current.style.transition = "none";
  }

  function handleSheetDragMove(e: React.TouchEvent) {
    if (sheetDragStartY.current === null) return;
    const dy = Math.max(0, e.touches[0].clientY - sheetDragStartY.current);
    if (ovLeftRef.current) {
      ovLeftRef.current.style.transform = `translateY(${dy}px)`;
      ovLeftRef.current.style.opacity = String(Math.max(0, 1 - dy / 280));
    }
  }

  function handleSheetDragEnd(e: React.TouchEvent) {
    if (sheetDragStartY.current === null) return;
    const dy = Math.max(0, e.changedTouches[0].clientY - sheetDragStartY.current);
    sheetDragStartY.current = null;
    const el = ovLeftRef.current;
    if (!el) return;
    if (dy > 100) {
      el.style.transition = "transform 0.22s ease, opacity 0.22s ease";
      el.style.transform = "translateY(100vh)";
      el.style.opacity = "0";
      setTimeout(() => {
        dismissSheet();
        el.style.transition = "";
        el.style.transform = "";
        el.style.opacity = "";
      }, 220);
    } else {
      el.style.transition = "transform 0.25s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease";
      el.style.transform = "translateY(0)";
      el.style.opacity = "1";
      setTimeout(() => { el.style.transition = ""; }, 250);
    }
  }

  function handleFeedDragStart(e: React.TouchEvent) {
    feedDragStartY.current = e.touches[0].clientY;
    if (ovRightRef.current) ovRightRef.current.style.transition = "none";
  }

  function handleFeedDragMove(e: React.TouchEvent) {
    if (feedDragStartY.current === null) return;
    const dy = Math.max(0, e.touches[0].clientY - feedDragStartY.current);
    if (ovRightRef.current) {
      ovRightRef.current.style.transform = `translateY(${dy}px)`;
      ovRightRef.current.style.opacity = String(Math.max(0, 1 - dy / 280));
    }
  }

  function handleFeedDragEnd(e: React.TouchEvent) {
    if (feedDragStartY.current === null) return;
    const dy = Math.max(0, e.changedTouches[0].clientY - feedDragStartY.current);
    feedDragStartY.current = null;
    const el = ovRightRef.current;
    if (!el) return;
    if (dy > 100) {
      el.style.transition = "transform 0.22s ease, opacity 0.22s ease";
      el.style.transform = "translateY(100vh)";
      el.style.opacity = "0";
      setTimeout(() => {
        setMobileFeedOpen(false);
        el.style.transition = "";
        el.style.transform = "";
        el.style.opacity = "";
      }, 220);
    } else {
      el.style.transition = "transform 0.25s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease";
      el.style.transform = "translateY(0)";
      el.style.opacity = "1";
      setTimeout(() => { el.style.transition = ""; }, 250);
    }
  }

  function renderMainPanel() {
    if (activePage === "dodawanie") {
      return (
        <div className="detailCard">
          <div className="detailHead">
            <div className="detailId">
              {pageIcon("dodawanie")}
              <span className="idCode">{t("add_code")}</span>
            </div>
            <button className="ghostBtn" onClick={() => setActivePage("mapa")}>✕</button>
          </div>
          <div className="detailBody">
            {currentUser ? (
              <>
                <ListingForm
                  selectedPoint={selectedPoint}
                  areaMode={areaMode}
                  circleRadius={circleRadius}
                  polygonPoints={polygonPoints}
                  defaultNick={userNick}
                  defaultContact={userContact}
                  onContactChange={(nextContact) => {
                    setUserContact(nextContact);
                  }}
                  onAreaModeChange={(mode) => {
                    setAreaMode(mode);
                    setPolygonPoints([]);
                    setPolygonFinished(false);
                  }}
                  onCircleRadiusChange={setCircleRadius}
                  onPolygonFinish={() => setPolygonFinished(true)}
                  onPolygonClear={() => { setPolygonPoints([]); setPolygonFinished(false); }}
                  onPointChange={(point) => {
                    setSelectedPoint(point);
                    mapRef.current?.flyTo({ center: [point.longitude, point.latitude], zoom: Math.max(mapRef.current.getZoom(), 13), duration: 600 });
                  }}
                  onMapPickRequest={() => setSheetMinimized(true)}
                  polygonFinished={polygonFinished}
                  onCreated={async (createdListing) => {
                    const privateLink = formatPrivateLink(createdListing.privateToken);
                    setLastPrivateLink(privateLink);
                    if (privateLink) window.localStorage.setItem("crashsite.lastPrivateLink", privateLink);
                    setSelectedListing(createdListing);
                    setSelectedPoint({ latitude: createdListing.latitude, longitude: createdListing.longitude });
                    setAreaMode("point");
                    setPolygonPoints([]);
                    setPolygonFinished(false);
                    setActivePage("mapa");
                    await refresh();
                  }}
                />
                {lastPrivateLink ? (
                  <CopyLinkPill label={t("priv_link")} href={lastPrivateLink} />
                ) : null}
              </>
            ) : (
              <>
                <h2>{t("add_needsLogin")}</h2>
                <p className="detailDesc">{t("add_needsLoginDesc")}</p>
                <div className="authStack">
                  {providers.filter(p => p !== "mock").map((p) => (
                    <button key={p} onClick={() => loginWithOAuth(p)}>
                      {t("add_continueWith", { provider: p.charAt(0).toUpperCase() + p.slice(1) })}
                    </button>
                  ))}
                  {providers.includes("mock") && (
                    <button onClick={() => void loginWithMock()}>{t("auth_devLogin")}</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      );
    }

    if (activePage === "logowanie") {
      if (currentUser) {
        setActivePage("ustawienia");
        return null;
      }

      return (
        <div className="detailCard">
          <div className="detailHead">
            <div className="detailId">
              {pageIcon("logowanie")}
              <span className="idCode">{t("auth_code")}</span>
            </div>
            <button className="ghostBtn" onClick={() => setActivePage("mapa")}>✕</button>
          </div>
          <div className="detailBody">
            <h2>{t("auth_title")}</h2>
            <p className="detailDesc">{t("auth_desc")}</p>
            {authError && <p className="error" style={{ margin: "0 0 12px" }}>{authError}</p>}
            <div className="oauthStack">
              {providers.filter(p => p !== "mock").map((p) => (
                <button key={p} className="oauthBtn" onClick={() => { setAuthError(null); loginWithOAuth(p); }}>
                  <span className="oauthDot" data-p={p} />
                  <span>{t("auth_continueWith", { provider: p.charAt(0).toUpperCase() + p.slice(1) })}</span>
                  <span className="oauthArrow">→</span>
                </button>
              ))}
              {providers.includes("mock") && (
                <button className="oauthBtn oauthMock" onClick={() => { setAuthError(null); void loginWithMock(); }}>
                  <span className="oauthDot" data-p="mock" />
                  <span>{t("auth_devLogin")}</span>
                  <span className="oauthArrow">→</span>
                </button>
              )}
            </div>
            <div className="oauthNote">{t("auth_note")}</div>
          </div>
        </div>
      );
    }

    if (activePage === "ustawienia") {
      return (
        <div className="detailCard">
          <div className="detailHead">
            <div className="detailId">
              {pageIcon("ustawienia")}
              <span className="idCode">{t("settings_code")}</span>
            </div>
            <button className="ghostBtn" onClick={() => setActivePage("mapa")}>✕</button>
          </div>
          <div className="detailBody">
            <div className="formGrid">
              <div className="formRow" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <span className="formLbl" style={{ margin: 0 }}>{t("settings_language")}</span>
                <div className="mcGroup" style={{ marginLeft: "auto" }}>
                  {(["en", "pl"] as const).map((l) => (
                    <button key={l} className={`mcMode ${lang === l ? "mcModeActive" : ""}`} onClick={() => setLang(l)}>
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {currentUser ? (
              <AccountSettingsPanel
                currentUser={currentUser}
                onUserUpdated={(nick, contact, nickNextAllowed) => {
                  setCurrentUser((prev) => prev ? { ...prev, nick, contact, nickNextAllowed: nickNextAllowed ?? prev.nickNextAllowed } : prev);
                  if (nick) {
                    setUserNick(nick);
                    setMyListings((prev) => prev.map((l) => ({ ...l, nickname: nick })));
                    setListings((prev) => {
                      const myIds = new Set(myListings.map((l) => l.id));
                      return prev.map((l) => myIds.has(l.id) ? { ...l, nickname: nick } : l);
                    });
                  }
                  if (contact) setUserContact(contact);
                }}
                onLogout={logout}
                onStickerOpen={() => setStickerOpen(true)}
                onHelpOpen={openHelp}
                onClose={() => setActivePage("mapa")}
              />
            ) : null}
          </div>
        </div>
      );
    }

    if (activePage === "zgloszenia") {
      return (
        <div className="detailCard">
          <div className="detailHead">
            <div className="detailId">
              {pageIcon("zgloszenia")}
              <span className="idCode">{t("my_code")}</span>
            </div>
            <button className="ghostBtn" onClick={() => setActivePage("mapa")}>✕</button>
          </div>
          <div className="detailBody">
            <h2>{t("my_title")}</h2>
            {myListings.length === 0 ? (
              <p className="detailDesc">{t("my_empty")}</p>
            ) : (
              <div className="myList">
                {myListings.map((listing) => {
                  const expired = isExpired(listing);
                  return (
                    <div key={listing.id} className={`myRow${expired ? " myRowExpired" : ""}`}>
                      <button
                        className="myRowMain"
                        onClick={() => expired ? (setSelectedListing(listing), setActivePage("edycja")) : handleSelectListing(listing)}
                      >
                        <div className={`myRowThumb ${getListingToneClass(listing)}`}>
                          {listing.imageUrl && <img src={listingImgUrl(listing, listing.imageUrl)} alt="" loading="lazy" />}
                        </div>
                        <div className="myRowBody">
                          <div className="myRowTitle">{listing.title ?? listing.nickname}</div>
                          <div className="myRowMeta mono">
                            {expired ? <span className="expiryBadge expiryBadgeExpired">{t("listing_expired")}</span> : listing.status}
                          </div>
                        </div>
                        <span className="myRowArrow">{expired ? "✎" : "→"}</span>
                      </button>
                      {expired && (
                        <div className="restoreDropdownWrap">
                          <button
                            className={`myRowRestore${restorePickerId === listing.id ? " myRowRestoreActive" : ""}`}
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setRestoreAnchorRect(rect);
                              setRestorePickerId((id) => id === listing.id ? null : listing.id);
                            }}
                            title={t("listing_restore_title")}
                          >
                            {t("listing_restore_arrow")}
                          </button>
                        </div>
                      )}
                      <button className="myRowDel" onClick={() => handleDelete(listing.id)} title={t("detail_delete")}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
            {lastPrivateLink ? (
              <CopyLinkPill label={t("priv_link")} href={lastPrivateLink} />
            ) : null}
          </div>
        </div>
      );
    }


    if (activePage === "edycja" && selectedListing) {
      return (
        <div className="detailCard">
          <div className="detailHead">
            <div className="detailId">
              {pageIcon("edycja")}
              <span className="idCode">{t("edit_code")}</span>
            </div>
            <button className="ghostBtn" onClick={() => setActivePage("mapa")}>✕</button>
          </div>
          <div className="detailBody">
            <EditListingForm
              listing={selectedListing}
              onUpdated={(updated) => {
                setSelectedListing(updated);
                setListings((prev) => prev.map((l) => l.id === updated.id ? updated : l));
                setMyListings((prev) => prev.map((l) => l.id === updated.id ? updated : l));
                setActivePage("mapa");
              }}
              onCancel={() => setActivePage("mapa")}
            />
          </div>
        </div>
      );
    }

    // map — detail panel
    return (
      <div className="detailCard">
        <div className="detailHead">
          <div className="detailId">
            <span className={`statusDot ${currentSelection ? getListingToneClass(currentSelection) : "statusFound"}`} />
            <span className="idCode">{currentSelection ? `#${currentSelection.id.slice(-6).toUpperCase()}` : t("detail_mapCode")}</span>
            <span className="detailKind">{currentSelection ? kindLabel(currentSelection) : t("detail_mapSub")}</span>
          </div>
          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            {currentSelection && !currentSelectionOwned ? (
              <button className="ghostBtn reportHeadBtn" title={t("report_btn")} onClick={() => setReportListingId(currentSelection.id)}>⚑</button>
            ) : null}
            {currentSelection ? <button className="ghostBtn" onClick={() => setSelectedListing(null)}>✕</button> : null}
          </div>
        </div>

        {!currentSelection ? (
          <div className="detailBody detailEmpty">
            <div className="emptyGraphic">
              <svg viewBox="0 0 120 120" width="80" height="80">
                <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
                <circle cx="60" cy="60" r="36" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
                <circle cx="60" cy="60" r="22" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
                <circle cx="60" cy="60" r="2" fill="currentColor" />
                <line x1="10" y1="60" x2="110" y2="60" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
                <line x1="60" y1="10" x2="60" y2="110" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
              </svg>
            </div>
            <div className="emptyTitle">{t("map_emptyTitle")}</div>
            <div className="emptySub">{t("map_emptySub")}</div>
          </div>
        ) : (
          <div className="detailBody">
            {currentSelection.imageUrl ? (() => {
              const allPhotos = [currentSelection.imageUrl!, ...(currentSelection.extraImageUrls ?? [])].map(u => listingImgUrl(currentSelection, u));
              const activePhoto = allPhotos[detailPhotoIndex] ?? allPhotos[0];
              return (
                <div className="detailPhotoWrap" data-type={currentSelection.type}>
                  <div className="detailPhoto">
                    <img
                      src={activePhoto}
                      alt={currentSelection.nickname}
                      className="detailPhotoImg"
                      onClick={() => setLightboxSrc(activePhoto)}
                    />
                    {currentSelection.eventTime && (
                      <div className="photoStamp">
                        <span>{currentSelection.eventTime}</span>
                      </div>
                    )}
                  </div>
                  {allPhotos.length > 1 && (
                    <div className="detailPhotoStrip">
                      {allPhotos.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt=""
                          className={`detailPhotoStripImg${i === detailPhotoIndex ? " detailPhotoStripActive" : ""}`}
                          onClick={() => setDetailPhotoIndex(i)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })() : null}

            <h2>{currentSelection.title ?? currentSelection.nickname}</h2>
            <div className="detailAuthor">
              <a className="avatar avatarLink" href={`${siteOrigin()}/u/${currentSelection.ownerId}`} target="_blank" rel="noreferrer">
                <img src={avatarUrl(currentSelection.ownerId)} alt="" />
              </a>
              <div>
                <a className="authorName authorNameLink" href={`${siteOrigin()}/u/${currentSelection.ownerId}`} target="_blank" rel="noreferrer">
                  @{currentSelection.nickname}
                </a>
                <div className="authorMeta">{t("detail_addedOn", { date: formatDate(currentSelection.createdAt, locale) })}</div>
                {currentSelection.updatedAt ? (
                  <div className="authorMeta">{t("detail_editedOn", { date: formatDate(currentSelection.updatedAt, locale) })}</div>
                ) : null}
              </div>
            </div>

            {currentSelection.description ? <p className="detailDesc">{currentSelection.description}</p> : null}

            <div className="detailMeta">
              {currentSelection.reward ? (
                <div className="detailMetaRow">
                  <span className="detailMetaLbl">{t("detail_reward")}</span>
                  <span className="detailMetaVal">{currentSelection.reward}</span>
                </div>
              ) : null}
              {currentSelection.contact ? (
                <div className="detailMetaRow detailMetaContact">
                  <span className="detailMetaLbl">{t("detail_contact")}</span>
                  <span className="detailMetaVal">{currentSelection.contact}</span>
                </div>
              ) : null}
              <div className="detailMetaRow detailMetaLoc">
                <span className="detailMetaLbl">{t("detail_location")}</span>
                <span className="detailMetaVal mono">{currentSelection.latitude.toFixed(4)}, {currentSelection.longitude.toFixed(4)}</span>
              </div>
            </div>

            {(currentSelection.eventDate || currentSelection.resolvedAt) && (
              <div className="detailMeta">
                {currentSelection.eventDate && (
                  <div className="detailMetaRow">
                    <span className="detailMetaLbl">{t("detail_lostDate")}</span>
                    <span className="detailMetaVal">{formatDate(currentSelection.eventDate + "T12:00:00", locale)}</span>
                  </div>
                )}
                {currentSelection.resolvedAt && (
                  <div className="detailMetaRow">
                    <span className="detailMetaLbl">{t("detail_foundDate")}</span>
                    <span className="detailMetaVal">{formatDate(currentSelection.resolvedAt + "T12:00:00", locale)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="detailActions">
              {currentUser && currentSelectionOwned ? (
                <button className="secondaryBtn" onClick={() => setActivePage("edycja")}>{t("detail_edit")}</button>
              ) : null}
              {currentUser && currentSelectionOwned && currentSelection.status !== "resolved" ? (
                resolveModalId === currentSelection.id ? (
                  <div className="resolveModal">
                    <span className="resolveModalTitle">{t("detail_resolveModalTitle")}</span>
                    <input
                      type="date"
                      value={resolveDate}
                      onChange={(e) => setResolveDate(e.target.value)}
                      max={new Date().toISOString().slice(0, 10)}
                    />
                    <div className="resolveModalBtns">
                      <button className="primaryBtn" onClick={() => markResolved(currentSelection.id, resolveDate)}>{t("detail_resolveConfirm")}</button>
                      <button className="secondaryBtn" onClick={() => { setResolveModalId(null); setResolveDate(""); }}>{t("detail_resolveCancel")}</button>
                    </div>
                  </div>
                ) : (
                  <button className="primaryBtn" onClick={() => setResolveModalId(currentSelection.id)}>{t("detail_markResolved")}</button>
                )
              ) : null}
              {currentSelection.status === "resolved" ? (
                <div className="resolvedBanner">{t("detail_resolved")}</div>
              ) : null}
              {currentUser && currentSelectionOwned ? (
                <button className="dangerBtn" onClick={() => handleDelete(currentSelection.id)}>{t("detail_delete")}</button>
              ) : null}
            </div>

            <div className="shareSection">
              <CopyLinkPill label={t("share_link")} href={getShareUrl(currentSelection)} />
            </div>
          </div>
        )}
      </div>
    );
  }

  const sheetOpen = activePage !== "mapa" || currentSelection !== null;

  // Keep dismissSheetRef current so the popstate listener always has fresh state
  dismissSheetRef.current = function () {
    if (activePage !== "mapa") setActivePage("mapa");
    else if (currentSelection) { setSelectedListing(null); setSelectedPoint(null); }
  };

  // Push history entry when sheet opens so browser/Android back button closes it
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (sheetOpen) window.history.pushState({ crashSiteSheet: true }, "");
  }, [sheetOpen]);

  // Scroll detail body to top and reset photo index when selected listing changes
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!currentSelection) return;
    setDetailPhotoIndex(0);
    const body = ovLeftRef.current?.querySelector<HTMLElement>(".detailBody");
    if (body) body.scrollTop = 0;
  }, [currentSelection?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hoverPosLatestRef = useRef({ x: 0, y: 0 });
  const hoverPosRafRef = useRef<number | null>(null);

  return (
    <>
    <div
      className={`app${sheetOpen ? " sheetOpen" : ""}${sheetMinimized ? " sheetMin" : ""}`}
      onMouseMove={(e) => {
        hoverPosLatestRef.current = { x: e.clientX, y: e.clientY };
        if (hoverPosRafRef.current === null) {
          hoverPosRafRef.current = requestAnimationFrame(() => {
            hoverPosRafRef.current = null;
            setHoverPos(hoverPosLatestRef.current);
          });
        }
      }}
    >
      {networkError ? (
        <div className="networkBanner">
          <span>{t("net_error")}</span>
          <button onClick={() => void refresh()}>{t("net_retry")}</button>
        </div>
      ) : null}

      <div className="mapCanvas">
      <MapView
        listings={visibleListings}
        selectedPoint={selectedPoint}
        showSelectedPointMarker={activePage === "dodawanie"}
        selectedListing={selectedListing}
        mapMode={mapMode}
        areaMode={areaMode}
        circleRadius={circleRadius}
        polygonDraftPoints={polygonPoints}
        onMapClick={(point) => {
          if (activePage === "dodawanie") {
            setSelectedPoint(point);
            mapRef.current?.flyTo({ center: [point.longitude, point.latitude], zoom: Math.max(mapRef.current.getZoom(), 13), duration: 600 });
          }
        }}
        onPolygonPoint={(point) => {
          if (activePage === "dodawanie" && !polygonFinished) setPolygonPoints((prev) => [...prev, point]);
        }}
        onPolygonPointsChange={setPolygonPoints}
        polygonFinished={polygonFinished}
        onListingClick={handleSelectListing}
        onListingHover={handleListingHover}
        onListingLeave={handleListingLeave}
        privateListingIds={privateListingIds}
        onMapReady={handleMapReady}
      />
      </div>

      {hoverListing ? (
        <div className="pinTip" style={{ left: hoverPos.x, top: hoverPos.y }}>
          <div className="pinTipTitle">{hoverListing.title ?? hoverListing.nickname}</div>
          <div className="pinTipMeta">@{hoverListing.nickname} · {formatDate(hoverListing.createdAt, locale)}</div>
        </div>
      ) : null}

      {menuOpen ? <button className="menuBackdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}

      <header className="ovTopLeft">
        <div className="topbarGroup" ref={topbarGroupRef}>
        <div className="topbar">
          <div className="topSection topBrand">
            <button className="topBurger" aria-label="menu" onClick={() => setMenuOpen((v) => !v)}>
              <span style={{ transform: menuOpen ? "translateY(5px) rotate(45deg)" : "" }} />
              <span style={{ opacity: menuOpen ? 0 : 1 }} />
              <span style={{ transform: menuOpen ? "translateY(-5px) rotate(-45deg)" : "" }} />
            </button>
            <div className="topMark">
              <svg width="22" height="28" viewBox="0 0 150 180" aria-hidden="true">
                <path d="M 75 10 C 40 10 22 36 22 62 C 22 100 75 155 75 155 C 75 155 128 100 128 62 C 128 36 110 10 75 10 Z" fill="oklch(0.68 0.22 38)" />
                <circle cx="61" cy="54" r="6" fill="oklch(0.22 0.004 260)" />
                <circle cx="89" cy="54" r="6" fill="oklch(0.22 0.004 260)" />
                <circle cx="61" cy="70" r="6" fill="oklch(0.22 0.004 260)" />
                <circle cx="89" cy="70" r="6" fill="oklch(0.22 0.004 260)" />
                <line x1="61" y1="54" x2="89" y2="70" stroke="oklch(0.22 0.004 260)" strokeWidth="2.5" />
                <line x1="89" y1="54" x2="61" y2="70" stroke="oklch(0.22 0.004 260)" strokeWidth="2.5" />
              </svg>
              <div>
                <div className="topName">{t("brand_name")}</div>
                <div className="topSub">{t("sb_tagline")}</div>
              </div>
            </div>
          </div>
          <div className="topSection topStat">
            <div className="topStatVal accent">{stats.active}</div>
            <div className="topStatLbl">{t("stats_active")}</div>
          </div>
          <div className="topSection topStat">
            <div className="topStatVal">{stats.resolved}</div>
            <div className="topStatLbl">{t("stats_found")}</div>
          </div>
          <div className="topSection topStat">
            <div className="topStatVal">{stats.total}</div>
            <div className="topStatLbl">{t("stats_total")}</div>
          </div>
          <div className="topSection topLive">
            <span className="pulse" />
            <span className="topLiveText">{t("stats_liveCount", { n: activeListCount })}</span>
          </div>
          {(displayName || !authChecked) ? (
            <div className="topSection topUser" style={!authChecked ? { visibility: "hidden" } : undefined}>
              <div className="topAvatar">{currentUser && <img src={avatarUrl(currentUser.id)} alt="" />}</div>
              <div className="topUserName">{displayName}</div>
            </div>
          ) : null}
          <button
            className="topSection topFeedToggle"
            onClick={() => setMobileFeedOpen((v) => !v)}
            aria-label="Toggle feed"
          >
            <svg width="18" height="13" viewBox="0 0 18 13" fill="none" aria-hidden="true">
              <rect x="0" y="0" width="18" height="2" rx="1" fill="currentColor"/>
              <rect x="0" y="5.5" width="13" height="2" rx="1" fill="currentColor"/>
              <rect x="0" y="11" width="9" height="2" rx="1" fill="currentColor"/>
            </svg>
          </button>
        </div>
          <AnnouncementBanner announcements={announcements} />

        {menuOpen ? (
          <div className="menuDropdownWrap">
            <div className="menuDropdown">
              {([
                ["zgloszenia", t("menu_myListings")],
                ["dodawanie", t("menu_addListing")],
                ["ustawienia", t("menu_settings")],
                ...(!displayName ? [["logowanie", t("menu_loginOAuth")]] : []),
              ] as Array<[Exclude<Page, "mapa">, string]>).map(([key, label]) => (
                <button
                  key={key}
                  className={`menuItem ${activePage === key ? "active" : ""}`}
                  onClick={() => {
                    if (key === "logowanie") { openLoginScreen(); return; }
                    selectPage(key);
                  }}
                >
                  {pageIcon(key, "menuIcon")}
                  <span>{label}</span>
                  {activePage === key ? <span className="menuDot" /> : null}
                </button>
              ))}
              {currentUser?.role === "admin" && (
                <button
                  className="menuItem"
                  onClick={() => { setMenuOpen(false); window.open("/admin", "_blank"); }}
                >
                  {pageIcon("admin", "menuIcon")}
                  <span>{t("menu_admin")}</span>
                  <span className="menuAdminArrow">↗</span>
                </button>
              )}
              <div className="menuDivider" />
              <div className="menuFoot">
                {displayName ? (
                  <>
                    <button className="menuFootUser" onClick={() => selectPage("ustawienia")}>
                      <span className="menuFootLabel">{t("menu_loggedAs")}</span>
                      <strong>{displayName}</strong>
                    </button>
                    <button className="linkBtn" onClick={logout}>{t("menu_logout")}</button>
                  </>
                ) : (
                  <span>{t("menu_noAccount")}</span>
                )}
              </div>
              <a
                className="menuGithubLink"
                href="https://github.com/MarekZegare4/crash-site/issues"
                target="_blank"
                rel="noreferrer"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
                    0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
                    -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
                    .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
                    -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27
                    .68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
                    .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
                    0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                <span>{t("menu_github")}</span>
              </a>
            </div>
          </div>
        ) : null}
        </div>
      </header>

      {!panelsHidden && (
        <aside
          ref={ovLeftRef}
          className={`ovLeft panelViewport${!sheetOpen ? " panelEmpty" : ""}${sheetMinimized ? " sheetMin" : ""}`}
        >
          {(() => {
            const panel = renderMainPanel();
            if (!sheetOpen || !React.isValidElement(panel)) return panel;
            const handle = (
              <div
                key="__handle"
                className="sheetHandle"
                onTouchStart={handleSheetDragStart}
                onTouchMove={handleSheetDragMove}
                onTouchEnd={handleSheetDragEnd}
              />
            );
            return React.cloneElement(
              panel as React.ReactElement<{ children?: React.ReactNode }>,
              {},
              handle,
              ...React.Children.toArray((panel as React.ReactElement<{ children?: React.ReactNode }>).props.children),
            );
          })()}
        </aside>
      )}

      {activePage === "mapa" && !panelsHidden ? (
        <aside ref={ovRightRef} className={`ovRight${mobileFeedOpen ? " ovRightOpen" : ""}`}>
          <ListingFeed
            listings={visibleListings}
            selectedId={selectedListing?.id ?? null}
            filter={listingFilter}
            query={listingQuery}
            locale={locale}
            mobileFeedOpen={mobileFeedOpen}
            onFilterChange={setListingFilter}
            onQueryChange={setListingQuery}
            onSelect={handleSelectListing}
            onMobileClose={() => setMobileFeedOpen(false)}
            onDragStart={handleFeedDragStart}
            onDragMove={handleFeedDragMove}
            onDragEnd={handleFeedDragEnd}
          />
        </aside>
      ) : null}

      <div className="fabGroup">
        {activePage === "mapa" && <button
          className="fab"
          onClick={() => {
            if (!currentUser) { openLoginScreen(); return; }
            setActivePage("dodawanie");
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5" />
            <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span>{t("fab_add")}</span>
        </button>}

        <div className="mapControls">
          <button className="mcBtn mcBtnZoom" onClick={() => mapRef.current?.zoomIn()}>+</button>
          <button className="mcBtn mcBtnZoom" onClick={() => mapRef.current?.zoomOut()}>−</button>
          <button
            className={`mcBtn${geoState === "error" ? " mcBtnGeoError" : ""}`}
            disabled={geoState === "loading"}
            onClick={() => {
              if (!navigator.geolocation) { setGeoState("error"); return; }
              setGeoState("loading");
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  setGeoState("idle");
                  mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15, duration: 1000 });
                },
                (err) => {
                  console.warn("Geolocation error", err.code, err.message);
                  setGeoState("error");
                  setTimeout(() => setGeoState("idle"), 2500);
                },
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
              );
            }}
            title="Center"
          >{geoState === "loading" ? "…" : geoState === "error" ? "✕" : "◎"}</button>
          <button className={`mcBtn mcBtnPanels ${panelsHidden ? "mcBtnActive" : ""}`} onClick={() => setPanelsHidden((v) => !v)} title="Toggle panels">▣</button>
          <div className="mcDiv" />
          {/* Desktop: inline group */}
          <div className="mcGroup mcGroupDesktop">
            {([["light", t("map_light")], ["dark", t("map_dark")], ["sat", t("map_sat")]] as const).map(([mode, label]) => (
              <button
                key={mode}
                className={`mcMode ${mapMode === mode ? "mcModeActive" : ""}`}
                onClick={() => setMapModeAndSave(mode)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Mobile: single toggle + dropdown */}
          <div className="mapModeDropdownWrap">
            {mapModeMenuOpen && (
              <div className="mapModeMenu">
                {([["light", t("map_light")], ["dark", t("map_dark")], ["sat", t("map_sat")]] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    className={`mapModeOption ${mapMode === mode ? "mapModeOptionActive" : ""}`}
                    onClick={() => { setMapMode(mode); setMapModeMenuOpen(false); }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <button
              className={`mcBtn mapModeToggle ${mapModeMenuOpen ? "mcBtnActive" : ""}`}
              onClick={() => setMapModeMenuOpen((v) => !v)}
              title="Map layer"
            >
              ▤
            </button>
          </div>
        </div>
      </div>

      {sheetMinimized && activePage === "dodawanie" && (
        <div className="mapPickPill">
          <div className="mapPickPillRow">
            <span className="mapPickPillText">
              {areaMode === "polygon"
                ? polygonFinished
                  ? t("form_polygonDragHint")
                  : polygonPoints.length > 0
                    ? `${polygonPoints.length} ${t("form_polygonPoints")}`
                    : t("form_polygonHint")
                : t("form_mapPick")}
            </span>
            {areaMode === "polygon" && (
              <div className="mapPickPillActions">
                <button
                  className="secondaryBtn pillActionBtn"
                  style={{ visibility: !polygonFinished && polygonPoints.length >= 3 ? "visible" : "hidden" }}
                  onClick={() => setPolygonFinished(true)}
                >
                  {t("form_polygonFinish")}
                </button>
                <button
                  className="ghostBtn pillActionBtn"
                  style={{ visibility: polygonPoints.length > 0 ? "visible" : "hidden" }}
                  onClick={() => { setPolygonPoints([]); setPolygonFinished(false); }}
                >
                  {t("form_polygonClear")}
                </button>
              </div>
            )}
            <button className="mapPickPillBack" onClick={() => setSheetMinimized(false)}>
              {t("form_mapPickBack")}
            </button>
          </div>
          {(areaMode === "point" || areaMode === "circle") && selectedPoint && (
            <div className="mapPickPillCoords">
              <input
                key={`lat-${selectedPoint.latitude.toFixed(5)}`}
                className="mapPickPillCoordInput"
                defaultValue={selectedPoint.latitude.toFixed(5)}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v >= -90 && v <= 90) {
                    const next = { ...selectedPoint, latitude: v };
                    setSelectedPoint(next);
                    mapRef.current?.flyTo({ center: [next.longitude, next.latitude], duration: 400 });
                  } else {
                    e.target.value = selectedPoint.latitude.toFixed(5);
                  }
                }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
              <input
                key={`lng-${selectedPoint.longitude.toFixed(5)}`}
                className="mapPickPillCoordInput"
                defaultValue={selectedPoint.longitude.toFixed(5)}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v >= -180 && v <= 180) {
                    const next = { ...selectedPoint, longitude: v };
                    setSelectedPoint(next);
                    mapRef.current?.flyTo({ center: [next.longitude, next.latitude], duration: 400 });
                  } else {
                    e.target.value = selectedPoint.longitude.toFixed(5);
                  }
                }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </div>
          )}
          {areaMode === "circle" && (
            <div className="mapPickPillRadius">
              <span className="mapPickPillRadiusLabel">{t("form_circleRadius")}</span>
              <input
                type="range"
                min={50}
                max={5000}
                step={50}
                value={circleRadius}
                onChange={(e) => setCircleRadius(Number(e.target.value))}
              />
              <span className="mapPickPillRadiusVal">{circleRadius}m</span>
            </div>
          )}
        </div>
      )}

      {stickerOpen && currentUser ? (
        <StickerModal
          displayName={currentUser.nick ?? displayName ?? currentUser.displayName}
          profileUrl={`${siteOrigin()}/u/${currentUser.id}`}
          onClose={() => setStickerOpen(false)}
        />
      ) : null}

      {reportListingId ? (
        <ReportModal
          listingId={reportListingId}
          onClose={() => setReportListingId(null)}
        />
      ) : null}

      {currentUser && !currentUser.nick ? (
        <NickSetupModal
          contact={currentUser.contact}
          onDone={(nick) => {
            setCurrentUser(prev => prev ? { ...prev, nick } : prev);
            setUserNick(nick);
            setMyListings((prev) => prev.map((l) => ({ ...l, nickname: nick })));
            setListings((prev) => {
              const myIds = new Set(myListings.map((l) => l.id));
              return prev.map((l) => myIds.has(l.id) ? { ...l, nickname: nick } : l);
            });
          }}
        />
      ) : null}

      {lightboxSrc && <PhotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      {showHelp && <HelpModal onClose={closeHelp} />}

    </div>

    {restorePickerId && restoreAnchorRect && createPortal(
      <div
        className="restoreMenu"
        style={{
          position: "fixed",
          ...(restoreAnchorRect.top > 250
            ? { bottom: window.innerHeight - restoreAnchorRect.top + 4 }
            : { top: restoreAnchorRect.bottom + 4 }),
          right: window.innerWidth - restoreAnchorRect.right,
        }}
      >
        {(["7d", "14d", "30d", "90d", "never"] as const).map((p) => (
          <button
            key={p}
            type="button"
            className="restoreOption"
            onClick={() => void handleRestore(restorePickerId, p)}
          >
            {t(`form_expiry_${p}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>,
      document.body
    )}
    </>
  );
}
