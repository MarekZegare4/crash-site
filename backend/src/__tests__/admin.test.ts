import { describe, it, expect, beforeAll } from "vitest";
import { api, login, loginAdmin, minimalListing } from "./helpers.js";

describe("Admin access control", () => {
  it("GET /api/admin/stats returns 403 for a regular user", async () => {
    const { cookie } = await login({ providerUserId: "non-admin-stats" });
    await api.get("/api/admin/stats").set("Cookie", cookie).expect(403);
  });

  it("GET /api/admin/stats returns 401 with no auth", async () => {
    await api.get("/api/admin/stats").expect(401);
  });

  it("GET /api/admin/listings returns 403 for a regular user", async () => {
    const { cookie } = await login({ providerUserId: "non-admin-listings" });
    await api.get("/api/admin/listings").set("Cookie", cookie).expect(403);
  });

  it("GET /api/admin/users returns 403 for a regular user", async () => {
    const { cookie } = await login({ providerUserId: "non-admin-users" });
    await api.get("/api/admin/users").set("Cookie", cookie).expect(403);
  });
});

describe("Admin — stats", () => {
  it("returns summary object with expected shape", async () => {
    const { cookie } = await loginAdmin();

    const res = await api.get("/api/admin/stats").set("Cookie", cookie).expect(200);

    expect(res.body).toMatchObject({
      listings: expect.any(Object),
      users: expect.any(Object),
    });
  });
});

describe("Admin — listings", () => {
  let adminCookie: string;
  let listingId: string;

  beforeAll(async () => {
    const adminSession = await loginAdmin();
    adminCookie = adminSession.cookie;

    const userSession = await login({ providerUserId: "admin-listing-owner" });
    const created = await api
      .post("/api/listings")
      .set("Cookie", userSession.cookie)
      .send(minimalListing)
      .expect(201);
    listingId = created.body.id;
  });

  it("GET /api/admin/listings returns an array", async () => {
    const res = await api.get("/api/admin/listings").set("Cookie", adminCookie).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("GET /api/admin/listings/:id returns listing detail", async () => {
    const res = await api
      .get(`/api/admin/listings/${listingId}`)
      .set("Cookie", adminCookie)
      .expect(200);

    expect(res.body.id).toBe(listingId);
  });

  it("PATCH /api/admin/listings/:id/status changes status", async () => {
    const res = await api
      .patch(`/api/admin/listings/${listingId}/status`)
      .set("Cookie", adminCookie)
      .send({ status: "resolved" })
      .expect(200);

    expect(res.body.status).toBe("resolved");
  });

  it("DELETE /api/admin/listings/:id removes the listing", async () => {
    const userSession = await login({ providerUserId: "admin-delete-owner" });
    const created = await api
      .post("/api/listings")
      .set("Cookie", userSession.cookie)
      .send(minimalListing)
      .expect(201);

    await api
      .delete(`/api/admin/listings/${created.body.id}`)
      .set("Cookie", adminCookie)
      .expect(204);

    await api.get(`/api/listings/${created.body.id}`).expect(404);
  });
});

describe("Admin — users", () => {
  let adminCookie: string;
  let targetUserId: string;

  beforeAll(async () => {
    const adminSession = await loginAdmin();
    adminCookie = adminSession.cookie;

    const userSession = await login({ providerUserId: "admin-ban-target", displayName: "Ban Target" });
    targetUserId = userSession.userId;
  });

  it("GET /api/admin/users returns an array with user objects", async () => {
    const res = await api.get("/api/admin/users").set("Cookie", adminCookie).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty("id");
    expect(res.body[0]).toHaveProperty("displayName");
  });

  it("PATCH /api/admin/users/:id/ban bans a user", async () => {
    await api
      .patch(`/api/admin/users/${targetUserId}/ban`)
      .set("Cookie", adminCookie)
      .send({ banned: true })
      .expect(200);
  });

  it("banned user gets 403 on authenticated endpoints", async () => {
    const bannedSession = await login({ providerUserId: "admin-ban-target" });
    await api
      .get("/api/listings/mine")
      .set("Cookie", bannedSession.cookie)
      .expect(403);
  });
});

describe("Admin — logs", () => {
  it("GET /api/admin/logs returns an array", async () => {
    const { cookie } = await loginAdmin();
    const res = await api.get("/api/admin/logs").set("Cookie", cookie).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
