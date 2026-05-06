let _siteOrigin = "";
export function setSiteOrigin(url: string) { _siteOrigin = url.replace(/\/$/, ""); }
export function siteOrigin(): string { return _siteOrigin || window.location.origin; }

export function formatDate(isoString: string, locale: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

export function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(seed)}`;
}

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function isHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

export async function normalizeImageFile(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  const { default: heic2any } = await import("heic2any");
  const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  const result = Array.isArray(blob) ? blob[0] : blob;
  const name = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([result], name, { type: "image/jpeg" });
}
