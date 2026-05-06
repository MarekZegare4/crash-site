import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchAdminListingDetail, adminUpdateListingStatus, adminDeleteListing, listingImgUrl } from "../api";
import type { AdminListingView } from "../api";
import { useT } from "../i18n";
import type { Listing } from "../types";
import PhotoLightbox from "./PhotoLightbox";

interface Props {
  listing: AdminListingView;
  onClose: () => void;
  onStatusChange: (id: string, status: "active" | "resolved") => void;
  onDeleted: (id: string) => void;
}

export default function AdminListingModal({ listing, onClose, onStatusChange, onDeleted }: Props) {
  const t = useT();
  const [detail, setDetail] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminListingDetail(listing.id)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [listing.id]);

  async function handleToggleStatus() {
    const next = listing.status === "active" ? "resolved" : "active";
    setActing(true);
    await adminUpdateListingStatus(listing.id, next).catch(() => {});
    onStatusChange(listing.id, next);
    setActing(false);
  }

  async function handleDelete() {
    if (!window.confirm(t("admin_confirmDelete"))) return;
    setActing(true);
    await adminDeleteListing(listing.id).catch(() => {});
    onDeleted(listing.id);
  }

  return (
    <>
    {createPortal(
    <div className="adminModalOverlay" onClick={onClose}>
      <div className="adminModalCard" onClick={e => e.stopPropagation()}>

        <div className="detailHead">
          <div className="detailId">
            <span className={`statusDot ${listing.status === "resolved" ? "statusRes" : listing.type === "found" ? "statusFound" : "statusLost"}`} />
            <span className="idCode">{listing.id.slice(0, 8)}</span>
            <span className="detailKind">{listing.nickname}</span>
          </div>
          <button className="ghostBtn" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <p className="adminLoading">…</p>
        ) : !detail ? (
          <p className="error" style={{ margin: 16 }}>{t("admin_loadError")}</p>
        ) : (
          <div className="adminModalBody">
            {detail.imageUrl && (
              <div className="adminModalImg">
                <img
                  src={listingImgUrl(detail, detail.imageUrl)}
                  alt=""
                  onClick={() => setLightboxSrc(listingImgUrl(detail, detail.imageUrl!))}
                />
              </div>
            )}

            <div className="adminModalMeta">
              <span className={`badge badge--${detail.type}`}>{detail.type}</span>
              <span className={`badge badge--${detail.status}`}>{detail.status}</span>
              <span className={`badge badge--${detail.isPublic ? "active" : "resolved"}`}>
                {detail.isPublic ? t("admin_visPublic") : t("admin_visPrivate")}
              </span>
            </div>

            <div className="adminModalFields">
              {detail.title && (
                <div className="adminModalField">
                  <span className="adminModalFieldLbl">{t("form_title")}</span>
                  <span>{detail.title}</span>
                </div>
              )}
              {detail.description && (
                <div className="adminModalField">
                  <span className="adminModalFieldLbl">{t("form_desc")}</span>
                  <span style={{ whiteSpace: "pre-wrap" }}>{detail.description}</span>
                </div>
              )}
              {detail.contact && (
                <div className="adminModalField">
                  <span className="adminModalFieldLbl">{t("form_contact")}</span>
                  <span className="mono">{detail.contact}</span>
                </div>
              )}
              {detail.reward && (
                <div className="adminModalField">
                  <span className="adminModalFieldLbl">{t("form_reward")}</span>
                  <span>{detail.reward}</span>
                </div>
              )}
              <div className="adminModalField">
                <span className="adminModalFieldLbl">{t("detail_location")}</span>
                <span className="mono">{detail.latitude.toFixed(5)}, {detail.longitude.toFixed(5)}</span>
              </div>
              <div className="adminModalField">
                <span className="adminModalFieldLbl">{t("admin_date")}</span>
                <span className="mono">{detail.createdAt.slice(0, 10)}</span>
              </div>
              <div className="adminModalField">
                <span className="adminModalFieldLbl">owner</span>
                <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>{detail.ownerId}</span>
              </div>
            </div>

            <div className="adminModalActions">
              <button className="adminActBtn" onClick={() => void handleToggleStatus()} disabled={acting}>
                {listing.status === "active" ? t("admin_setResolved") : t("admin_setActive")}
              </button>
              <button className="adminActBtn adminActDanger" onClick={() => void handleDelete()} disabled={acting}>
                {t("admin_delete")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
    )}
    {lightboxSrc && <PhotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </>
  );
}
