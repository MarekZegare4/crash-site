import { useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  src: string;
  onClose: () => void;
}

export default function PhotoLightbox({ src, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="lightboxOverlay" onClick={onClose}>
      <img
        className="lightboxImg"
        src={src}
        alt=""
        onClick={e => e.stopPropagation()}
      />
      <button className="lightboxClose" onClick={onClose}>✕</button>
    </div>,
    document.body
  );
}
