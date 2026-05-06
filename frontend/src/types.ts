export type ListingType = "lost" | "found";
export type ListingStatus = "active" | "resolved";

export type ListingArea =
  | { type: "circle"; radius: number }
  | { type: "polygon"; points: Array<{ lat: number; lng: number }> };

export interface Listing {
  id: string;
  type: ListingType;
  nickname: string;
  title?: string;
  description?: string;
  latitude: number;
  longitude: number;
  area?: ListingArea;
  eventDate?: string;
  eventTime?: string;
  reward?: string;
  contact?: string;
  imageUrl: string;
  extraImageUrls: string[];
  isPublic: boolean;
  privateToken?: string;
  ownerId: string;
  status: ListingStatus;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string | null;
  resolvedAt?: string;
}

export interface ListingStats {
  total: number;
  active: number;
  resolved: number;
}
