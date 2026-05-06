import { describe, it, expect } from "vitest";
import { api, login } from "./helpers.js";

describe("GET /api/auth/me", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await api.get("/api/auth/me").expect(401);
    expect(res.body.error).toBeDefined();
  });

  it("returns the logged-in user when a valid session cookie is present", async () => {
    const { cookie, userId } = await login({ providerUserId: "me-user-1" });
    const res = await api.get("/api/auth/me").set("Cookie", cookie).expect(200);
    expect(res.body.user.id).toBe(userId);
    expect(res.body.user.displayName).toBe("Test User");
  });

  it("returns 401 for a tampered token", async () => {
    await api
      .get("/api/auth/me")
      .set("Cookie", "session=not.a.valid.token")
      .expect(401);
  });
});

describe("GET /api/auth/mock-login", () => {
  it("sets an httpOnly session cookie", async () => {
    const res = await api
      .get("/api/auth/mock-login")
      .query({ providerUserId: "cookie-test", displayName: "Cookie User" })
      .expect(200);

    const setCookie = res.headers["set-cookie"] as unknown as string[] | undefined;
    expect(setCookie).toBeDefined();
    const sessionCookie = setCookie!.find((c) => c.startsWith("session="));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
  });

  it("returns user data in response body", async () => {
    const res = await api
      .get("/api/auth/mock-login")
      .query({ providerUserId: "body-test", displayName: "Body User" })
      .expect(200);

    expect(res.body.user.displayName).toBe("Body User");
    expect(res.body.user.role).toBe("user");
    expect(res.body.user).not.toHaveProperty("password");
  });

  it("creates an admin user when providerUserId matches ADMIN_SOCIAL_IDS", async () => {
    const res = await api
      .get("/api/auth/mock-login")
      .query({ providerUserId: "admin-test-id", displayName: "Admin" })
      .expect(200);

    expect(res.body.user.role).toBe("admin");
  });

  it("returns the same user ID on repeated logins (upsert)", async () => {
    const first = await api
      .get("/api/auth/mock-login")
      .query({ providerUserId: "repeat-login", displayName: "User" })
      .expect(200);
    const second = await api
      .get("/api/auth/mock-login")
      .query({ providerUserId: "repeat-login", displayName: "User" })
      .expect(200);

    expect(first.body.user.id).toBe(second.body.user.id);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    const { cookie } = await login({ providerUserId: "logout-user" });

    const logoutRes = await api
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .expect(200);

    const setCookie = logoutRes.headers["set-cookie"] as unknown as string[] | undefined;
    expect(setCookie?.some((c) => c.includes("session=;") || c.includes("session= ;"))).toBe(true);
  });

  it("after logout, /auth/me returns 401", async () => {
    const { cookie } = await login({ providerUserId: "logout-me-user" });

    const logoutRes = await api.post("/api/auth/logout").set("Cookie", cookie);
    const clearedCookie = (logoutRes.headers["set-cookie"] as unknown as string[])?.[0] ?? "";

    await api.get("/api/auth/me").set("Cookie", clearedCookie).expect(401);
  });
});

describe("GET /api/auth/providers", () => {
  it("returns 'mock' provider in test/dev environment", async () => {
    const res = await api.get("/api/auth/providers").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toContain("mock");
  });
});
