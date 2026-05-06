import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import maplibregl from "maplibre-gl";
import { fetchPrivateListing, listingImgUrl } from "./api";
import MapView from "./components/MapView";
import PhotoLightbox from "./components/PhotoLightbox";
import { useT } from "./i18n";
import type { Listing } from "./types";
import { avatarUrl, formatDate } from "./utils";


export default function PrivateView() {
  const { token } = useParams<{ token: string }>();
  const [listing, setListing] = useState<Listing | null | "loading">("loading");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const mapMode = "light" as const;
  const mapRef = useRef<maplibregl.Map | null>(null);
  const t = useT();

  useEffect(() => {
    if (!token) { setListing(null); return; }
    void fetchPrivateListing(token)
      .then((l) => { setListing(l); setPhotoIndex(0); })
      .catch(() => setListing(null));
  }, [token]);

  useEffect(() => {
    if (listing && listing !== "loading") {
      mapRef.current?.flyTo({ center: [listing.longitude, listing.latitude], zoom: 14, duration: 800 });
    }
  }, [listing]);

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
  }, []);

  const listings = useMemo(
    () => (listing && listing !== "loading" ? [listing] : []),
    [listing]
  );

  const kindLabel = (l: Listing) =>
    l.status === "resolved" ? t("kind_resolved") : l.type === "lost" ? t("kind_lost") : t("kind_found");

  const statusDotClass = (l: Listing) =>
    l.status === "resolved" ? "statusResolved" : l.type === "lost" ? "statusLost" : "statusFound";

  const resolvedListing = listing !== "loading" ? listing : null;

  return (
    <>
    <div className="app">
      <MapView
        listings={listings}
        selectedPoint={null}
        showSelectedPointMarker={false}
        selectedListing={resolvedListing}
        mapMode={mapMode}
        areaMode="point"
        circleRadius={500}
        polygonDraftPoints={[]}
        polygonFinished={false}
        onMapReady={handleMapReady}
      />

      <aside className="ovLeft panelViewport">
        <div className="detailCard">
          <div className="detailHead">
            <div className="detailId">
              {listing && listing !== "loading"
                ? <span className={`statusDot ${statusDotClass(listing)}`} />
                : <span className="statusDot statusFound" />}
              <span className="idCode">{t("priv_code")}</span>
              <span className="detailKind">{t("priv_sub")}</span>
            </div>
          </div>

          {listing === "loading" ? (
            <div className="detailBody privateBody" />
          ) : !listing ? (
            <div className="detailBody privateBody">
              <h2>{t("priv_notFound")}</h2>
              <p className="detailDesc">{t("priv_notFoundDesc")}</p>
            </div>
          ) : (
            <div className="detailBody">
              {listing.imageUrl ? (() => {
                const allPhotos = [listing.imageUrl!, ...(listing.extraImageUrls ?? [])].map(u => listingImgUrl(listing, u));
                const activePhoto = allPhotos[photoIndex] ?? allPhotos[0];
                return (
                  <div className="detailPhotoWrap" data-type={listing.type}>
                    <div className="detailPhoto">
                      <img
                        src={activePhoto}
                        alt={listing.nickname}
                        className="detailPhotoImg"
                        onClick={() => setLightboxSrc(activePhoto)}
                      />
                      <div className="photoStamp">
                        <span>{listing.eventDate ? formatDate(listing.eventDate + "T12:00:00", t("date_locale")) : formatDate(listing.createdAt, t("date_locale"))}</span>
                        {listing.eventTime ? <span>{listing.eventTime}</span> : null}
                      </div>
                    </div>
                    {allPhotos.length > 1 && (
                      <div className="detailPhotoStrip">
                        {allPhotos.map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt=""
                            className={`detailPhotoStripImg${i === photoIndex ? " detailPhotoStripActive" : ""}`}
                            onClick={() => setPhotoIndex(i)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })() : null}

              <h2>{listing.title ?? listing.nickname}</h2>
              <div className="detailAuthor">
                <div className="avatar"><img src={avatarUrl(listing.ownerId)} alt="" /></div>
                <div>
                  <div className="authorName">@{listing.nickname}</div>
                  <div className="authorMeta">
                    {kindLabel(listing)} · {formatDate(listing.createdAt, t("date_locale"))}
                  </div>
                </div>
              </div>

              {listing.description ? <p className="detailDesc">{listing.description}</p> : null}

              <div className="detailMeta">
                <div className="detailMetaRow">
                  <span className="detailMetaLbl">{t("priv_status")}</span>
                  <span className="detailMetaVal">{kindLabel(listing)}</span>
                </div>
                {listing.reward ? (
                  <div className="detailMetaRow">
                    <span className="detailMetaLbl">{t("detail_reward")}</span>
                    <span className="detailMetaVal">{listing.reward}</span>
                  </div>
                ) : null}
                {listing.contact ? (
                  <div className="detailMetaRow detailMetaContact">
                    <span className="detailMetaLbl">{t("detail_contact")}</span>
                    <span className="detailMetaVal">{listing.contact}</span>
                  </div>
                ) : null}
                <div className="detailMetaRow detailMetaLoc">
                  <span className="detailMetaLbl">{t("detail_location")}</span>
                  <span className="detailMetaVal mono">{listing.latitude.toFixed(4)}, {listing.longitude.toFixed(4)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
    {lightboxSrc && <PhotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </>
  );
}
