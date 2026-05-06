import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";

interface Props {
  displayName: string;
  profileUrl: string;
  onClose: () => void;
}

type StickerFormat = "card" | "qr" | "tag";

const QR_SIZE: Record<StickerFormat, number> = { card: 160, qr: 220, tag: 130 };

async function makeQrCanvas(url: string, size: number): Promise<HTMLCanvasElement> {
  const { default: QRCode } = await import("qrcode");
  const c = document.createElement("canvas");
  await QRCode.toCanvas(c, url, { width: size, margin: 1, color: { dark: "#111111", light: "#ffffff" } });
  return c;
}

async function renderToCanvas(format: StickerFormat, displayName: string, profileUrl: string, tagCallout = "Found this drone? Scan the QR code to contact the owner.", belongsTo = "This drone belongs to:"): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  const DPR = 2;
  const qrSize = QR_SIZE[format];
  const qr = await makeQrCanvas(profileUrl, qrSize * DPR);

  function make(W: number, H: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement("canvas");
    c.width = W * DPR; c.height = H * DPR;
    const ctx = c.getContext("2d")!;
    ctx.scale(DPR, DPR);
    return [c, ctx];
  }

  const R = 12; // shared border radius

  function clipRound(ctx: CanvasRenderingContext2D, W: number, H: number) {
    roundRect(ctx, 0, 0, W, H, R);
    ctx.clip();
  }

  function strokeBorder(ctx: CanvasRenderingContext2D, W: number, H: number) {
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, 0.5, W - 1, H - 1, R);
    ctx.stroke();
  }

  if (format === "qr") {
    const pad = 20;
    const W = qrSize + pad * 2, H = qrSize + pad * 2;
    const [c, ctx] = make(W, H);
    ctx.save(); clipRound(ctx, W, H);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(qr, pad, pad, qrSize, qrSize);
    ctx.restore(); strokeBorder(ctx, W, H);
    return c;
  }

  if (format === "tag") {
    // Match DOM: stickerTag width=320, stickerTagRight = qrSize(130) + padding(12*2)=154
    const W = 320;
    const rightW = qrSize + 24;
    const leftW = W - rightW; // 166
    const lp = 14; // left padding, matches .stickerTagLeft padding
    const contentW = leftW - lp * 2; // 138

    // Measure wrapped callout lines to derive canvas height
    const measureCanvas = document.createElement("canvas");
    const mctx = measureCanvas.getContext("2d")!;
    mctx.font = `12px "Inter Tight", sans-serif`;
    const calloutLines: string[] = [];
    let line = "";
    for (const word of tagCallout.split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (mctx.measureText(test).width > contentW && line) { calloutLines.push(line); line = word; }
      else { line = test; }
    }
    if (line) calloutLines.push(line);

    const lineH = 17;
    const contentH = 14 + 17 + 10 + 14 + 6 + 20 + 8 + calloutLines.length * lineH + 14;
    const H = Math.max(contentH, qrSize + 24);

    const [c, ctx] = make(W, H);
    ctx.save(); clipRound(ctx, W, H);
    ctx.fillStyle = "#111111"; ctx.fillRect(0, 0, leftW, H);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(leftW, 0, W, H);

    // crash_site
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 13px "JetBrains Mono", monospace`;
    ctx.textAlign = "left";
    ctx.fillText("crash_site", lp, 27);

    // owner label — mono uppercase like a form label
    ctx.fillStyle = "#888888";
    ctx.font = `10px "JetBrains Mono", monospace`;
    ctx.fillText(belongsTo.toUpperCase(), lp, 27 + 10 + 12);

    // display name
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 17px "Inter Tight", sans-serif`;
    ctx.fillText(displayName, lp, 27 + 10 + 12 + 6 + 17, contentW);

    // callout
    ctx.fillStyle = "#888888";
    ctx.font = `12px "Inter Tight", sans-serif`;
    const calloutY = 27 + 10 + 12 + 6 + 17 + 8 + 13;
    calloutLines.forEach((l, i) => ctx.fillText(l, lp, calloutY + i * lineH));

    // QR
    const qrX = leftW + (rightW - qrSize) / 2;
    ctx.drawImage(qr, qrX, (H - qrSize) / 2, qrSize, qrSize);
    ctx.restore(); strokeBorder(ctx, W, H);
    return c;
  }

  // card
  const W = 320, pad = 14;
  const H = 48 + pad + 16 + 6 + 26 + 12 + 1 + 12 + qrSize + pad + 34;
  const [c, ctx] = make(W, H);
  ctx.save(); clipRound(ctx, W, H);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#111111"; ctx.fillRect(0, 0, W, 48);
  ctx.fillStyle = "#ffffff"; ctx.font = `bold 14px "JetBrains Mono", monospace`; ctx.textAlign = "left";
  ctx.fillText("crash_site", 38, 31);
  ctx.fillStyle = "#ffffff"; ctx.font = `bold 11px "JetBrains Mono", monospace`; ctx.textAlign = "right";
  ctx.fillText("DRONE TAG", W - pad, 31);
  let y = 48 + pad;
  ctx.fillStyle = "#999999"; ctx.font = `10px "JetBrains Mono", monospace`; ctx.textAlign = "left";
  ctx.fillText(belongsTo.toUpperCase(), pad, y + 11); y += 18;
  ctx.fillStyle = "#111111"; ctx.font = `bold 20px "Inter Tight", sans-serif`;
  ctx.fillText(displayName, pad, y + 20, W - pad * 2); y += 30;
  y += 10; ctx.fillStyle = "#eeeeee"; ctx.fillRect(pad, y, W - pad * 2, 1); y += 13;
  ctx.drawImage(qr, pad, y, qrSize, qrSize);
  const calloutX = pad + qrSize + 12;
  ctx.fillStyle = "#444444"; ctx.font = `12px "Inter Tight", sans-serif`;
  wrapText(ctx, "Found this drone? Scan the QR or visit the link below to contact the owner.", calloutX, y + 14, W - calloutX - pad, 17);
  y += qrSize + pad;
  ctx.fillStyle = "#eeeeee"; ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = "#888888"; ctx.font = `10px "JetBrains Mono", monospace`; ctx.textAlign = "left";
  ctx.fillText(profileUrl, pad, y + 22, W - pad * 2);
  ctx.restore(); strokeBorder(ctx, W, H);
  return c;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y); y += lineH; line = word;
    } else { line = test; }
  }
  if (line) ctx.fillText(line, x, y);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StickerModal({ displayName, profileUrl, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const preRendered = useRef<HTMLCanvasElement | null>(null);
  const t = useT();
  const [format, setFormat] = useState<StickerFormat>("card");
  const [downloading, setDownloading] = useState(false);

  // Draw QR preview
  useEffect(() => {
    void makeQrCanvas(profileUrl, QR_SIZE[format]).then((qr) => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;
      canvasRef.current.width = qr.width;
      canvasRef.current.height = qr.height;
      ctx.drawImage(qr, 0, 0);
    });
  }, [profileUrl, format]);

  // Pre-render download canvas so share() fires close to user gesture
  const tagCallout = t("sticker_callout_tag");
  const belongsTo = t("sticker_belongsTo");
  useEffect(() => {
    preRendered.current = null;
    void renderToCanvas(format, displayName, profileUrl, tagCallout, belongsTo).then((c) => { preRendered.current = c; });
  }, [format, displayName, profileUrl, tagCallout, belongsTo]);

  function handlePrint() {
    const canvas = preRendered.current;
    if (!canvas) return;
    const src = canvas.toDataURL("image/png");
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;border:0;opacity:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>@page{margin:12mm;size:auto}body{margin:0;padding:0;display:flex;justify-content:center}img{max-width:100%;height:auto;display:block}</style></head><body><img src="${src}"></body></html>`);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* already removed */ } }, 2000);
    }, 100);
  }

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const canvas = preRendered.current ?? await renderToCanvas(format, displayName, profileUrl, tagCallout, belongsTo);
      canvas.toBlob(async (blob) => {
        if (!blob) { setDownloading(false); return; }
        const file = new File([blob], "crash-site-tag.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ files: [file], title: "crash_site drone tag" }); }
          catch { triggerDownload(blob, "crash-site-tag.png"); }
        } else {
          triggerDownload(blob, "crash-site-tag.png");
        }
        setDownloading(false);
      }, "image/png");
    } catch { setDownloading(false); }
  }

  const formatLabels: Record<StickerFormat, string> = {
    card: t("sticker_format_card"),
    qr: t("sticker_format_qr"),
    tag: t("sticker_format_tag"),
  };

  return createPortal(
    <div className="stickerOverlay" onClick={onClose}>
      <div className="stickerModal" onClick={(e) => e.stopPropagation()}>

        <div className="stickerActions noPrint">
          <div className="stickerFormatTabs">
            {(["card", "qr", "tag"] as StickerFormat[]).map((f) => (
              <button key={f} className={`stickerFormatTab${format === f ? " stickerFormatTabActive" : ""}`} onClick={() => setFormat(f)}>
                {formatLabels[f]}
              </button>
            ))}
          </div>
          <div className="stickerActionRow">
            <button className="primaryBtn" style={{ flex: 1 }} onClick={handleDownload} disabled={downloading}>
              {downloading ? "…" : t("sticker_download")}
            </button>
            <button className="secondaryBtn" onClick={handlePrint}>{t("sticker_print")}</button>
            <button className="ghostBtn" onClick={onClose}>✕</button>
          </div>
          <span className="stickerActionsLabel">{t("sticker_hint")}</span>
        </div>

        {format === "qr" && (
          <div className="stickerQrOnly">
            <canvas ref={canvasRef} className="stickerQr" style={{ width: QR_SIZE.qr, height: QR_SIZE.qr }} />
          </div>
        )}

        {format === "tag" && (
          <div className="stickerTag">
            <div className="stickerTagLeft">
              <div className="stickerBrand" style={{ color: "#ffffff" }}>crash_site</div>
              <div className="stickerOwnerLabel" style={{ marginTop: 10 }}>{t("sticker_belongsTo")}</div>
              <div className="stickerTitle" style={{ color: "#ffffff", fontSize: 17 }}>{displayName}</div>
              <div className="stickerCallout" style={{ marginTop: 8, fontSize: 12, color: "#888" }}>{tagCallout}</div>
            </div>
            <div className="stickerTagRight">
              <canvas ref={canvasRef} className="stickerQr" style={{ width: QR_SIZE.tag, height: QR_SIZE.tag }} />
            </div>
          </div>
        )}

        {format === "card" && (
          <div className="stickerCard">
            <div className="stickerHeader">
              <div className="stickerBrandLockup">
                <svg width="16" height="20" viewBox="0 0 150 180">
                  <path d="M 75 10 C 40 10 22 36 22 62 C 22 100 75 155 75 155 C 75 155 128 100 128 62 C 128 36 110 10 75 10 Z" fill="#ffffff" />
                  <circle cx="61" cy="54" r="6" fill="#111111" />
                  <circle cx="89" cy="54" r="6" fill="#111111" />
                  <circle cx="61" cy="70" r="6" fill="#111111" />
                  <circle cx="89" cy="70" r="6" fill="#111111" />
                  <line x1="61" y1="54" x2="89" y2="70" stroke="#111111" strokeWidth="2.5" />
                  <line x1="89" y1="54" x2="61" y2="70" stroke="#111111" strokeWidth="2.5" />
                </svg>
                <div className="stickerBrand">crash_site</div>
              </div>
              <div className="stickerTagLabel">{t("sticker_tagLabel")}</div>
            </div>
            <div className="stickerBody">
              <div className="stickerOwnerLabel">{t("sticker_belongsTo")}</div>
              <div className="stickerTitle">{displayName}</div>
              <div className="stickerDivider" />
              <div className="stickerQrRow">
                <canvas ref={canvasRef} className="stickerQr" style={{ width: QR_SIZE.card, height: QR_SIZE.card }} />
                <div className="stickerCallout">{t("sticker_callout")}</div>
              </div>
            </div>
            <div className="stickerUrl mono">{profileUrl}</div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}
