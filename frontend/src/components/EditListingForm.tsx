import { useState, type FormEvent } from "react";
import { editListing, listingImgUrl, uploadImage } from "../api";
import { useT } from "../i18n";
import type { Listing } from "../types";
import { MAX_IMAGE_SIZE, normalizeImageFile } from "../utils";

interface Props {
  listing: Listing;
  onUpdated: (listing: Listing) => void;
  onCancel: () => void;
}

export default function EditListingForm({ listing, onUpdated, onCancel }: Props) {
  const t = useT();
  const [title, setTitle] = useState(listing.title ?? "");
  const [description, setDescription] = useState(listing.description ?? "");
  const [eventDate, setEventDate] = useState(listing.eventDate ?? "");
  const [eventTime, setEventTime] = useState(listing.eventTime ?? "");
  const [reward, setReward] = useState(listing.reward ?? "");
  const [contact, setContact] = useState(listing.contact ?? "");
  const [isPublic, setIsPublic] = useState(listing.isPublic);
  const [expiryPreset, setExpiryPreset] = useState<"7d" | "14d" | "30d" | "90d" | "never">(() => {
    if (!listing.expiresAt) return "never";
    const days = Math.round((new Date(listing.expiresAt).getTime() - Date.now()) / 86_400_000);
    if (days <= 0) return "never";
    if (days <= 7) return "7d";
    if (days <= 14) return "14d";
    if (days <= 30) return "30d";
    return "90d";
  });
  const [existingUrls, setExistingUrls] = useState<string[]>([
    ...(listing.imageUrl ? [listing.imageUrl] : []),
    ...(listing.extraImageUrls ?? []),
  ]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (title.length > 120) { setError(t("err_titleTooLong")); return; }
      if (description.length > 1000) { setError(t("err_descTooLong")); return; }
      if (reward.length > 120) { setError(t("err_rewardTooLong")); return; }
      if (contact.length > 200) { setError(t("err_contactTooLong")); return; }
      if (newFiles.some((f) => f.size > MAX_IMAGE_SIZE)) { setError(t("err_photoTooLarge")); return; }

      let uploadedUrls: string[] = [];
      if (newFiles.length > 0) {
        try {
          setUploading(true);
          uploadedUrls = await Promise.all(newFiles.map((f) => uploadImage(f)));
        } catch (err) {
          setError(`${t("err_uploadFailed")} (${String(err)})`);
          return;
        } finally {
          setUploading(false);
        }
      }

      const allUrls = [...existingUrls, ...uploadedUrls].slice(0, 3);
      const [imageUrl, ...extraImageUrls] = allUrls;

      const updated = await editListing(listing.id, {
        title: title || undefined,
        description: description || undefined,
        eventDate: eventDate || null,
        eventTime: eventTime || null,
        reward: reward || null,
        contact: contact || null,
        isPublic,
        expiresAt: expiryPreset === "never" ? null : (() => {
          const d = new Date();
          d.setDate(d.getDate() + { "7d": 7, "14d": 14, "30d": 30, "90d": 90 }[expiryPreset]);
          return d.toISOString();
        })(),
        imageUrl: imageUrl ?? "",
        extraImageUrls: imageUrl ? extraImageUrls : [],
      });

      onUpdated(updated);
    } catch {
      setError(t("err_editFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="editForm" onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="formGrid">
        <label className="formRow">
          <span className="formLbl">{t("form_title")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("form_titlePh")} />
        </label>

        <label className="formRow">
          <span className="formLbl">{t("form_desc")}</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("form_descPh")} rows={3} />
        </label>

        <div className="formRow2">
          <label className="formRow">
            <span className="formLbl">{t("form_date")}</span>
            <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </label>
          <label className="formRow">
            <span className="formLbl">{t("form_time")}</span>
            <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
          </label>
        </div>

        <label className="formRow">
          <span className="formLbl">{t("form_reward")}</span>
          <input value={reward} onChange={(e) => setReward(e.target.value)} placeholder={t("form_rewardPh")} />
        </label>

        <label className="formRow">
          <span className="formLbl">{t("form_contact")}</span>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t("form_contactPh")} />
        </label>

        <div className="formRow">
          <span className="formLbl">{t("edit_photoOptional")}</span>
          <span className="formSub">{t("form_photoSub")}</span>
          {(existingUrls.length > 0 || newFiles.length > 0) && (
            <div className="photoGrid">
              {existingUrls.map((url, i) => (
                <div key={url} className="photoThumb">
                  <img src={listingImgUrl(listing, url)} alt="" loading="lazy" />
                  <button type="button" className="photoRemove" onClick={() => setExistingUrls((prev) => prev.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              {newFiles.map((f, i) => (
                <div key={i} className="photoThumb">
                  <img src={URL.createObjectURL(f)} alt={f.name} />
                  <button type="button" className="photoRemove" onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
          )}
          {existingUrls.length + newFiles.length < 3 && (
            <div className={`dropZone${normalizing ? " dropZoneLoading" : ""}`}>
              <span>{normalizing ? t("form_photoNormalizing") : uploading ? t("form_photoUploading") : t("form_photoPh")}</span>
              <input
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                disabled={normalizing}
                onChange={async (e) => {
                  const chosen = Array.from(e.target.files ?? []);
                  const slots = 3 - existingUrls.length - newFiles.length;
                  e.target.value = "";
                  setNormalizing(true);
                  try {
                    const normalized = await Promise.all(chosen.map(normalizeImageFile));
                    setNewFiles((prev) => [...prev, ...normalized].slice(0, prev.length + slots));
                  } finally {
                    setNormalizing(false);
                  }
                }}
              />
            </div>
          )}
        </div>

        <label className="formRow" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            style={{ width: "auto", padding: 0 }}
          />
          <span className="formLbl" style={{ margin: 0 }}>{t("form_isPublic")}</span>
        </label>

        <div className="formRow">
          <span className="formLbl">{t("form_expiry")}</span>
          {listing.expiresAt && new Date(listing.expiresAt) < new Date() && (
            <span className="expiryBadge expiryBadgeExpired">{t("listing_expired")}</span>
          )}
          <div className="mcGroup">
            {(["7d", "14d", "30d", "90d", "never"] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={`mcMode ${expiryPreset === p ? "mcModeActive" : ""}`}
                onClick={() => setExpiryPreset(p)}
              >
                {t(`form_expiry_${p}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="primaryBtn" disabled={submitting} style={{ flex: 1 }}>
          {submitting ? t("edit_submitting") : t("edit_submit")}
        </button>
        <button type="button" className="secondaryBtn" onClick={onCancel} disabled={submitting}>
          ✕
        </button>
      </div>
    </form>
  );
}
