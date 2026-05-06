import { useEffect, useState, type FormEvent } from "react";
import { createListing, uploadImage } from "../api";
import { useT } from "../i18n";
import type { Listing, ListingArea } from "../types";
import { MAX_IMAGE_SIZE, normalizeImageFile } from "../utils";

interface Props {
  selectedPoint: { latitude: number; longitude: number } | null;
  areaMode: "point" | "circle" | "polygon";
  circleRadius: number;
  polygonPoints: Array<{ lat: number; lng: number }>;
  polygonFinished: boolean;
  defaultNick: string;
  defaultContact: string;
  onContactChange: (contact: string) => void;
  onAreaModeChange: (mode: "point" | "circle" | "polygon") => void;
  onCircleRadiusChange: (radius: number) => void;
  onPolygonFinish: () => void;
  onPolygonClear: () => void;
  onPointChange: (point: { latitude: number; longitude: number }) => void;
  onMapPickRequest?: () => void;
  onCreated: (listing: Listing) => void;
}

function parseCoords(raw: string): { latitude: number; longitude: number } | null {
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

export default function ListingForm({
  selectedPoint, areaMode, circleRadius, polygonPoints, polygonFinished,
  defaultNick, defaultContact, onContactChange,
  onAreaModeChange, onCircleRadiusChange, onPolygonFinish, onPolygonClear,
  onPointChange, onMapPickRequest, onCreated
}: Props) {
  const t = useT();
  const [type, setType] = useState<"lost" | "found">("lost");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [reward, setReward] = useState("");
  const [contact, setContact] = useState(defaultContact);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [expiryPreset, setExpiryPreset] = useState<"7d" | "14d" | "30d" | "90d" | "never">("never");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [coordInput, setCoordInput] = useState("");
  const [coordError, setCoordError] = useState(false);

  useEffect(() => {
    if (!selectedPoint) return;
    setCoordInput(`${selectedPoint.latitude.toFixed(6)}, ${selectedPoint.longitude.toFixed(6)}`);
    setCoordError(false);
  }, [selectedPoint]);

  useEffect(() => {
    if (!contact) setContact(defaultContact);
  }, [defaultContact]);

  const locationReady = areaMode === "polygon"
    ? polygonPoints.length >= 3
    : selectedPoint !== null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (!defaultNick.trim()) { setError(t("err_nickRequired")); return; }
      if (imageFiles.some((f) => f.size > MAX_IMAGE_SIZE)) { setError(t("err_photoTooLarge")); return; }
      if (title.length > 120) { setError(t("err_titleTooLong")); return; }
      if (description.length > 1000) { setError(t("err_descTooLong")); return; }
      if (reward.length > 120) { setError(t("err_rewardTooLong")); return; }
      if (contact.length > 200) { setError(t("err_contactTooLong")); return; }

      let imageUrl: string | undefined;
      let extraImageUrls: string[] = [];
      if (imageFiles.length > 0) {
        try {
          setUploading(true);
          const urls = await Promise.all(imageFiles.map((f) => uploadImage(f)));
          imageUrl = urls[0];
          extraImageUrls = urls.slice(1);
        } catch (err) {
          setError(`${t("err_uploadFailed")} (${String(err)})`);
          return;
        } finally {
          setUploading(false);
        }
      }

      let latitude: number;
      let longitude: number;
      let area: ListingArea | undefined;

      if (areaMode === "polygon" && polygonPoints.length >= 3) {
        latitude = polygonPoints.reduce((s, p) => s + p.lat, 0) / polygonPoints.length;
        longitude = polygonPoints.reduce((s, p) => s + p.lng, 0) / polygonPoints.length;
        area = { type: "polygon", points: polygonPoints };
      } else if (selectedPoint) {
        latitude = selectedPoint.latitude;
        longitude = selectedPoint.longitude;
        area = areaMode === "circle" ? { type: "circle", radius: circleRadius } : undefined;
      } else {
        setError(t("err_locationRequired"));
        return;
      }

      const created = await createListing({
        type,
        nickname: defaultNick,
        title: title || undefined,
        description: description || undefined,
        latitude,
        longitude,
        area,
        eventDate: eventDate || undefined,
        eventTime: eventTime || undefined,
        reward: reward || undefined,
        contact: contact || undefined,
        imageUrl: imageUrl ?? "",
        extraImageUrls,
        isPublic,
        expiresAt: expiryPreset === "never" ? null : (() => {
          const d = new Date();
          d.setDate(d.getDate() + { "7d": 7, "14d": 14, "30d": 30, "90d": 90 }[expiryPreset]);
          return d.toISOString();
        })(),
      });

      setTitle("");
      setDescription("");
      setReward("");
      setImageFiles([]);
      onContactChange(contact);
      onCreated(created);
    } catch {
      setError(t("err_createFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="listingForm" onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="typeToggle">
        <button type="button" className={type === "lost" ? "ttActive" : ""} onClick={() => setType("lost")}>
          {t("form_typeLost")}
        </button>
        <button type="button" className={type === "found" ? "ttActive" : ""} onClick={() => setType("found")}>
          {t("form_typeFound")}
        </button>
      </div>

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

        {/* Location section */}
        <div className="formRow">
          <span className="formLbl">{t("form_location")}</span>

          <div className="mcGroup">
            {(["point", "circle", "polygon"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`mcMode${areaMode === mode ? " mcModeActive" : ""}`}
                onClick={() => onAreaModeChange(mode)}
              >
                {t(`form_area${mode.charAt(0).toUpperCase()}${mode.slice(1)}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>

          {areaMode !== "polygon" ? (
            <div className="locBox">
              <input
                className={`locCoordsInput mono${coordError ? " locCoordsError" : ""}`}
                value={coordInput}
                placeholder={t("form_coordsPh")}
                onChange={(e) => {
                  const val = e.target.value;
                  setCoordInput(val);
                  if (!val.trim()) { setCoordError(false); return; }
                  const parsed = parseCoords(val);
                  if (parsed) { setCoordError(false); onPointChange(parsed); }
                  else setCoordError(true);
                }}
              />
              <span className="locTarget">◎</span>
            </div>
          ) : (
            <div className="polygonStatus">
              <span className="polygonStatusCount">{polygonPoints.length} {t("form_polygonPoints")}</span>
              {polygonFinished && <span className="polygonStatusDone">✓</span>}
              <span className="polygonStatusHint">
                {polygonFinished ? t("form_polygonDragHint") : t("form_polygonHint")}
              </span>
            </div>
          )}

          {areaMode === "circle" && (
            <div className="locRadiusRow">
              <span className="formLbl" style={{ margin: 0 }}>{t("form_circleRadius")}</span>
              <input
                type="range"
                min={50} max={5000} step={50}
                value={circleRadius}
                onChange={(e) => onCircleRadiusChange(Number(e.target.value))}
              />
              <span className="locRadiusVal">{circleRadius}m</span>
            </div>
          )}

          {areaMode === "polygon" && (
            <div className="polygonActions">
              <button
                type="button"
                className="secondaryBtn locCtrlBtn"
                style={{ visibility: !polygonFinished && polygonPoints.length >= 3 ? "visible" : "hidden" }}
                onClick={onPolygonFinish}
              >
                {t("form_polygonFinish")}
              </button>
              <button
                type="button"
                className="ghostBtn locCtrlBtn"
                style={{ visibility: polygonPoints.length > 0 ? "visible" : "hidden" }}
                onClick={onPolygonClear}
              >
                {t("form_polygonClear")}
              </button>
            </div>
          )}

          {onMapPickRequest && (
            <button type="button" className="mapPickBtn" onClick={onMapPickRequest}>
              {t("form_mapPick")}
            </button>
          )}
        </div>

        <div className="formRow">
          <span className="formLbl">{t("form_photo")}</span>
          <span className="formSub">{t("form_photoSub")}</span>
          {imageFiles.length > 0 && (
            <div className="photoGrid">
              {imageFiles.map((f, i) => (
                <div key={i} className="photoThumb">
                  <img src={URL.createObjectURL(f)} alt={f.name} />
                  <button
                    type="button"
                    className="photoRemove"
                    onClick={() => setImageFiles((prev) => prev.filter((_, j) => j !== i))}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          {imageFiles.length < 3 && (
            <div className={`dropZone${normalizing ? " dropZoneLoading" : ""}`}>
              <span>{normalizing ? t("form_photoNormalizing") : uploading ? t("form_photoUploading") : t("form_photoPh")}</span>
              <input
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                disabled={normalizing}
                onChange={async (e) => {
                  const chosen = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  setNormalizing(true);
                  try {
                    const normalized = await Promise.all(chosen.map(normalizeImageFile));
                    setImageFiles((prev) => [...prev, ...normalized].slice(0, 3));
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

      <button
        type="submit"
        className="primaryBtn"
        disabled={submitting || !locationReady || !defaultNick.trim()}
      >
        {submitting ? t("form_submitting") : t("form_submit")}
      </button>
    </form>
  );
}
