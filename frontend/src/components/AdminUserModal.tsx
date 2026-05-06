import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchUserProfile, adminResetNickCooldown, adminSetUserNick } from "../api";
import type { AdminUserView } from "../api";
import type { Listing } from "../types";
import { useT } from "../i18n";

interface Props {
  user: AdminUserView;
  onClose: () => void;
  onSelectListing: (listingId: string) => void;
  onBanToggle: (id: string, banned: boolean) => void;
  onUserUpdated: (patch: Partial<AdminUserView>) => void;
}

export default function AdminUserModal({ user, onClose, onSelectListing, onBanToggle, onUserUpdated }: Props) {
  const t = useT();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const [nickValue, setNickValue] = useState(user.nick ?? "");
  const [nickState, setNickState] = useState<"idle" | "saving" | "saved" | "taken">("idle");
  const nickInputRef = useRef<HTMLInputElement>(null);

  const [cooldownState, setCooldownState] = useState<"idle" | "done">("idle");
  const [nickChangedAt, setNickChangedAt] = useState(user.nickChangedAt);

  useEffect(() => {
    fetchUserProfile(user.id)
      .then(p => setListings(p.listings))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user.id]);

  async function handleSetNick() {
    const nick = nickValue.trim();
    if (nick.length < 2) return;
    setNickState("saving");
    try {
      const updated = await adminSetUserNick(user.id, nick);
      setNickChangedAt(updated.nickChangedAt);
      setCooldownState("idle");
      onUserUpdated({ nick: updated.nick, nickChangedAt: updated.nickChangedAt });
      setNickState("saved");
      setTimeout(() => setNickState("idle"), 2000);
    } catch (err) {
      setNickState((err as Error).message === "nick_taken" ? "taken" : "idle");
    }
  }

  async function handleResetCooldown() {
    if (!window.confirm(t("admin_confirmResetNickCooldown"))) return;
    try {
      const updated = await adminResetNickCooldown(user.id);
      setNickChangedAt(updated.nickChangedAt);
      onUserUpdated({ nickChangedAt: updated.nickChangedAt });
      setCooldownState("done");
      setTimeout(() => setCooldownState("idle"), 2000);
    } catch {
      // silent
    }
  }

  return createPortal(
    <div className="adminModalOverlay" onClick={onClose}>
      <div className="adminModalCard" onClick={e => e.stopPropagation()}>

        <div className="detailHead">
          <div className="detailId">
            <span className={`badge badge--${user.provider}`}>{user.provider}</span>
            <span className="idCode">{user.displayName}</span>
            {user.nick && <span className="detailKind mono">{user.nick}</span>}
          </div>
          <button className="ghostBtn" onClick={onClose}>✕</button>
        </div>

        <div className="adminModalBody">
          <div className="adminModalFields">
            <div className="adminModalField">
              <span className="adminModalFieldLbl">ID</span>
              <span className="mono" style={{ fontSize: 11, opacity: 0.6 }}>{user.id}</span>
            </div>
            <div className="adminModalField">
              <span className="adminModalFieldLbl">{t("admin_role")}</span>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className={`badge badge--${user.role}`}>{user.role}</span>
                {user.banned && <span className="badge badge--banned">{t("admin_banned")}</span>}
              </span>
            </div>
            <div className="adminModalField">
              <span className="adminModalFieldLbl">{t("admin_date")}</span>
              <span className="mono">{user.createdAt.slice(0, 10)}</span>
            </div>
            <div className="adminModalField">
              <span className="adminModalFieldLbl">{t("admin_nickChangedAt")}</span>
              <span className="mono">{nickChangedAt ? nickChangedAt.slice(0, 10) : <span style={{ opacity: 0.35 }}>—</span>}</span>
            </div>
          </div>

          <div className="adminModalSection">
            <div className="adminModalFieldLbl" style={{ marginBottom: 6 }}>{t("admin_nickInput")}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                ref={nickInputRef}
                className="adminNickInput"
                value={nickValue}
                onChange={e => { setNickValue(e.target.value); setNickState("idle"); }}
                onKeyDown={e => e.key === "Enter" && void handleSetNick()}
                placeholder={user.nick ?? "—"}
                maxLength={60}
              />
              <button
                className="adminActBtn"
                onClick={() => void handleSetNick()}
                disabled={nickState === "saving" || nickValue.trim().length < 2}
              >
                {nickState === "saving" ? t("admin_setNickSaving") : nickState === "saved" ? t("admin_setNickSaved") : t("admin_setNick")}
              </button>
            </div>
            {nickState === "taken" && (
              <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>{t("admin_nickTaken")}</p>
            )}
          </div>

          <div className="adminModalActions">
            <button
              className={`adminActBtn${user.banned ? "" : " adminActDanger"}`}
              onClick={() => {
                const msg = user.banned ? t("admin_confirmUnban") : t("admin_confirmBan");
                if (!window.confirm(msg)) return;
                onBanToggle(user.id, !user.banned);
              }}
            >
              {user.banned ? t("admin_unban") : t("admin_ban")}
            </button>
            <button
              className="adminActBtn"
              onClick={() => void handleResetCooldown()}
              disabled={!nickChangedAt}
            >
              {cooldownState === "done" ? t("admin_resetNickCooldownDone") : t("admin_resetNickCooldown")}
            </button>
          </div>

          <div>
            <div className="adminModalFieldLbl" style={{ marginBottom: 8 }}>
              {t("admin_userListings")} · {listings.length}
            </div>
            {loading ? (
              <p className="adminLoading">…</p>
            ) : listings.length === 0 ? (
              <p style={{ opacity: 0.4, fontSize: 13 }}>{t("admin_noListings")}</p>
            ) : (
              <div className="adminUserListings">
                {listings.map(l => (
                  <div
                    key={l.id}
                    className="adminUserListingRow"
                    onClick={() => { onClose(); onSelectListing(l.id); }}
                  >
                    <span className={`badge badge--${l.type}`}>{l.type}</span>
                    <span className="adminUserListingTitle">{l.title || l.id.slice(0, 8)}</span>
                    <span className={`badge badge--${l.status}`}>{l.status}</span>
                    <span className="adminUserListingMeta">{l.createdAt.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
