import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import maplibregl from "maplibre-gl";
import { fetchUserProfile } from "./api";
import type { UserPublicProfile } from "./api";
import MapView from "./components/MapView";
import PhotoLightbox from "./components/PhotoLightbox";
import { useT } from "./i18n";
import type { Listing } from "./types";
import { avatarUrl, formatDate } from "./utils";


export default function ProfileView() {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<UserPublicProfile | null | "loading">("loading");
  const [selected, setSelected] = useState<Listing | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const t = useT();

  useEffect(() => {
    if (!userId) { setProfile(null); return; }
    void fetchUserProfile(userId)
      .then((p) => { setProfile(p); })
      .catch(() => setProfile(null));
  }, [userId]);

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
  }, []);

  const handleSelectListing = useCallback((listing: Listing) => {
    setSelected(listing);
    setPhotoIndex(0);
    mapRef.current?.flyTo({ center: [listing.longitude, listing.latitude], zoom: 15, duration: 600 });
  }, []);

  const handleBack = useCallback(() => {
    setSelected(null);
  }, []);

  const listings = useMemo(
    () => (profile && profile !== "loading" ? profile.listings : []),
    [profile]
  );

  const kindLabel = (l: Listing) =>
    l.type === "lost" ? t("kind_lost") : t("kind_found");

  if (profile === "loading") {
    return <div className="app privateApp" />;
  }

  if (!profile) {
    return (
      <div className="app privateApp">
        <section className="privateCard detailCard">
          <div className="detailHead">
            <div className="detailId">
              <span className="statusDot statusResolved" />
              <span className="idCode">{t("profile_code")}</span>
            </div>
          </div>
          <div className="detailBody privateBody">
            <h2>{t("profile_notFound")}</h2>
            <p className="detailDesc">{t("profile_notFoundDesc")}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
    <div className="app">
      <MapView
        listings={listings}
        selectedPoint={selected ? { latitude: selected.latitude, longitude: selected.longitude } : null}
        showSelectedPointMarker={false}
        selectedListing={selected}
        mapMode="light"
        areaMode="point"
        circleRadius={500}
        polygonDraftPoints={[]}
        polygonFinished={false}
        onListingClick={handleSelectListing}
        onMapReady={handleMapReady}
      />

      <aside className="ovLeft panelViewport">
        <div className="detailCard">
          <div className="detailHead">
            <div className="detailId">
              <span className="statusDot statusFound" />
              <span className="idCode">{t("profile_code")}</span>
              <span className="detailKind">{t("profile_sub")}</span>
            </div>
            {selected && (
              <button className="ghostBtn" onClick={handleBack} title="←">
                ←
              </button>
            )}
          </div>

          {selected ? (
            <div className="detailBody">
              {selected.imageUrl ? (() => {
                const allPhotos = [selected.imageUrl!, ...(selected.extraImageUrls ?? [])];
                const activePhoto = allPhotos[photoIndex] ?? allPhotos[0];
                return (
                  <div className="detailPhotoWrap" data-type={selected.type}>
                    <div className="detailPhoto">
                      <img
                        src={activePhoto}
                        alt={selected.nickname}
                        className="detailPhotoImg"
                        onClick={() => setLightboxSrc(activePhoto)}
                      />
                      {selected.eventTime && (
                        <div className="photoStamp">
                          <span>{selected.eventTime}</span>
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
                            className={`detailPhotoStripImg${i === photoIndex ? " detailPhotoStripActive" : ""}`}
                            onClick={() => setPhotoIndex(i)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })() : null}

              <h2>{selected.title ?? selected.nickname}</h2>
              <div className="detailAuthor">
                <div className="avatar"><img src={avatarUrl(userId!)} alt="" /></div>
                <div>
                  <div className="authorName">{profile.displayName}</div>
                  <div className="authorMeta">
                    {kindLabel(selected)} · {formatDate(selected.createdAt, t("date_locale"))}
                  </div>
                </div>
              </div>

              {selected.description ? <p className="detailDesc">{selected.description}</p> : null}

              <div className="detailMeta">
                {selected.reward ? (
                  <div className="detailMetaRow">
                    <span className="detailMetaLbl">{t("detail_reward")}</span>
                    <span className="detailMetaVal">{selected.reward}</span>
                  </div>
                ) : null}
                {selected.contact ? (
                  <div className="detailMetaRow detailMetaContact">
                    <span className="detailMetaLbl">{t("detail_contact")}</span>
                    <span className="detailMetaVal">{selected.contact}</span>
                  </div>
                ) : null}
                <div className="detailMetaRow detailMetaLoc">
                  <span className="detailMetaLbl">{t("detail_location")}</span>
                  <span className="detailMetaVal mono">{selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="detailBody">
              <div className="profileFoundBanner">{t("profile_foundBanner")}</div>

              <div className="detailAuthor" style={{ marginTop: 14 }}>
                <div className="avatar"><img src={avatarUrl(userId!)} alt="" /></div>
                <div>
                  <div className="authorName">{profile.displayName}</div>
                  <div className="authorMeta">{t("profile_ownerLabel")}</div>
                </div>
              </div>

              {listings.length === 0 ? (
                <p className="detailDesc" style={{ marginTop: 14 }}>{t("profile_noActiveListings")}</p>
              ) : (
                <>
                  <p className="detailDesc" style={{ marginTop: 14 }}>{t("profile_activeListings", { n: listings.length })}</p>
                  <div className="profileListings">
                    {listings.map((l) => (
                      <button
                        key={l.id}
                        className="profileListingRow"
                        onClick={() => handleSelectListing(l)}
                      >
                        <div className="feedThumb" data-type={l.type} data-status={l.status} style={{ width: 48, height: 48, flexShrink: 0 }}>
                          {l.imageUrl && <img src={l.imageUrl} alt={l.nickname} className="feedThumbImage" loading="lazy" />}
                        </div>
                        <div className="profileListingInfo">
                          <div className="profileListingTitle">{l.title ?? l.nickname}</div>
                          <div className="profileListingMeta">
                            <span className={`tag ${l.type === "lost" && l.status === "active" ? "tag-lost" : "tag-found"}`}>{kindLabel(l)}</span>
                            <span>{formatDate(l.createdAt, t("date_locale"))}</span>
                          </div>
                        </div>
                        <span className="myRowArrow">→</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
    {lightboxSrc && <PhotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </>
  );
}
