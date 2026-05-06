import { useLayoutEffect, useRef, useState } from "react";
import type { Announcement } from "../api";
import { useT } from "../i18n";

const DISMISSED_KEY = "crashsite.dismissedAnnouncements";

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

function AnnouncementItem({ ann, onDismiss }: { ann: Announcement; onDismiss: () => void }) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLSpanElement>(null);
  const [scrolling, setScrolling] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const check = () => {
      const item = itemRef.current;
      if (item) {
        const itemW = item.offsetWidth;
        container.style.setProperty("--marquee-offset", `${itemW}px`);
        setScrolling(itemW > container.clientWidth);
      } else {
        setScrolling(container.scrollWidth > container.clientWidth);
      }
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, [ann.message, scrolling]);

  const duration = Math.max(6, Math.round(ann.message.length * 0.22));

  return (
    <div className={`announcementBanner announcementBanner--${ann.type}`}>
      <div
        ref={containerRef}
        className="announcementMsg"
        style={{ "--marquee-duration": `${duration}s` } as React.CSSProperties}
      >
        {scrolling ? (
          <span className="announcementMarquee">
            <span ref={itemRef} className="announcementMarqueeItem">{ann.message}</span>
            <span className="announcementMarqueeItem" aria-hidden="true">{ann.message}</span>
          </span>
        ) : (
          <span>{ann.message}</span>
        )}
      </div>
      <button className="announcementDismiss" onClick={onDismiss} aria-label={t("ann_dismiss")}>✕</button>
    </div>
  );
}

interface Props {
  announcements: Announcement[];
}

export default function AnnouncementBanner({ announcements }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissed);

  // show only the single most recent undismissed announcement
  const latest = announcements.find(a => !dismissed.has(a.id));
  if (!latest) return null;
  const visible = [latest];

  function dismiss(id: string) {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }

  return (
    <div className="announcementStack">
      {visible.map(ann => (
        <AnnouncementItem key={ann.id} ann={ann} onDismiss={() => dismiss(ann.id)} />
      ))}
    </div>
  );
}
