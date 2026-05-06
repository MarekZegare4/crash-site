import request from "supertest";
import { app } from "../app.js";

export const api = request(app);

export interface Session {
  cookie: string;
  userId: string;
  displayName: string;
}

export async function login(opts: {
  providerUserId?: string;
  displayName?: string;
  provider?: string;
} = {}): Promise<Session> {
  const providerUserId = opts.providerUserId ?? "test-user-default";
  const displayName = opts.displayName ?? "Test User";
  const provider = opts.provider ?? "google";

  const res = await api
    .get("/api/auth/mock-login")
    .query({ providerUserId, displayName, provider })
    .expect(200);

  const setCookieHeader = res.headers["set-cookie"] as unknown as string[] | undefined;
  const rawCookie = setCookieHeader?.[0] ?? "";
  return { cookie: rawCookie, userId: res.body.user.id, displayName };
}

export async function loginAdmin(): Promise<Session> {
  return login({ providerUserId: "admin-test-id", displayName: "Admin User" });
}

export const minimalListing = {
  type: "lost",
  nickname: "TestNick",
  latitude: 52.2297,
  longitude: 21.0122,
  isPublic: true,
  imageUrl: "/uploads/test.webp",
};
