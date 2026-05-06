import type { Listing } from "../types";
import { listingImgUrl } from "../api";
import { useT } from "../i18n";
import { formatDate } from "../utils";

interface Props {
  listings: Listing[];
  selectedId: string | null;
  filter: "all" | "lost" | "found";
  query: string;
  locale: string;
  mobileFeedOpen: boolean;
  onFilterChange: (f: "all" | "lost" | "found") => void;
  onQueryChange: (q: string) => void;
  onSelect: (listing: Listing) => void;
  onMobileClose: () => void;
  onDragStart: (e: React.TouchEvent) => void;
  onDragMove: (e: React.TouchEvent) => void;
  onDragEnd: (e: React.TouchEvent) => void;
}

function kindLabel(l: Listing, t: ReturnType<typeof useT>) {
  return l.type === "lost" && l.status === "active" ? t("kind_lost") : t("kind_found");
}

export default function ListingFeed({
  listings, selectedId, filter, query, locale, mobileFeedOpen,
  onFilterChange, onQueryChange, onSelect, onMobileClose,
  onDragStart, onDragMove, onDragEnd,
}: Props) {
  const t = useT();

  return (
    <div className="feedCard">
      <div
        className="sheetHandle"
        onTouchStart={onDragStart}
        onTouchMove={onDragMove}
        onTouchEnd={onDragEnd}
      />
      <div className="feedHeader">
        <div>
          <h3>{t("feed_title")}</h3>
          <div className="feedMeta">{t("feed_count", { n: listings.length })}</div>
        </div>
        <button className="ghostBtn feedCloseMobile" onClick={onMobileClose}>✕</button>
        <div className="feedSearch">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <line x1="7.5" y1="7.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder={t("feed_search")} />
        </div>
      </div>
      <div className="feedFilter">
        {([["all", t("feed_all")], ["lost", t("feed_lost")], ["found", t("feed_found")]] as const).map(([key, label]) => (
          <button
            key={key}
            className={`chip ${filter === key ? "chipActive" : ""}`}
            onClick={() => onFilterChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="feedList">
        {listings.map((listing) => (
          <button
            key={listing.id}
            className={`feedItem ${selectedId === listing.id ? "feedItemSel" : ""}`}
            onClick={() => onSelect(listing)}
          >
            <div className="feedThumb" data-type={listing.type} data-status={listing.status}>
              {listing.imageUrl && <img src={listingImgUrl(listing, listing.imageUrl)} alt={listing.nickname} className="feedThumbImage" loading="lazy" />}
            </div>
            <div className="feedBody">
              <div className="feedTitle">{listing.title ?? listing.nickname}</div>
              <div className="feedSub">
                <span className={`tag ${listing.status === "resolved" || listing.type === "found" ? "tag-found" : "tag-lost"}`}>
                  {kindLabel(listing, t)}
                </span>
                <span className="feedNick">@{listing.nickname}</span>
              </div>
              <div className="feedFoot">
                <span>{formatDate(listing.createdAt, locale)}</span>
                {listing.reward ? <><span>·</span><span className="rewardChip">{listing.reward}</span></> : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
