import fs from "node:fs";
import path from "node:path";
import type { Listing } from "./types.js";

function getRepoRoot(): string {
  return process.cwd().endsWith(`${path.sep}backend`) ? path.resolve(process.cwd(), "..") : process.cwd();
}

const dataDir = path.join(getRepoRoot(), "data");
const dataFile = path.join(dataDir, "listings.json");

export function loadListingsFromDisk(): Listing[] {
  try {
    if (!fs.existsSync(dataFile)) {
      return [];
    }

    const raw = fs.readFileSync(dataFile, "utf-8");
    const parsed = JSON.parse(raw) as Array<Listing & { title?: string; contactName?: string; contactChannel?: string }>;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((listing) => ({
      ...listing,
      nickname: listing.nickname ?? listing.title ?? "Uzytkownik",
      title: listing.title ?? undefined,
      contact: listing.contact ?? listing.contactChannel ?? listing.contactName ?? undefined,
      imageUrl: listing.imageUrl ?? ""
    }));
  } catch {
    return [];
  }
}

