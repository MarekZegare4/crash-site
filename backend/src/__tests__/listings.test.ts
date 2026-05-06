import { describe, it, expect, beforeAll } from "vitest";
import { api, login, loginAdmin, minimalListing } from "./helpers.js";

describe("GET /api/listings", () => {
  it("returns an array (no auth required)", async () => {
    const res = await api.get("/api/listings").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/listings/stats", () => {
  it("returns stats object with total/active/resolved", async () => {
    const res = await api.get("/api/listings/stats").expect(200);
    expect(res.body).toMatchObject({
      total: expect.any(Number),
      active: expect.any(Number),
      resolved: expect.any(Number),
    });
  });
});

describe("POST /api/listings", () => {
  it("returns 401 when not authenticated", async () => {
    await api.post("/api/listings").send(minimalListing).expect(401);
  });

  it("creates a listing when authenticated with valid data", async () => {
    const { cookie } = await login({ providerUserId: "create-listing-user" });

    const res = await api
      .post("/api/listings")
      .set("Cookie", cookie)
      .send(minimalListing)
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.type).toBe("lost");
    expect(res.body.latitude).toBe(52.2297);
    expect(res.body.status).toBe("active");
  });

  it("returns 400 for missing required fields", async () => {
    const { cookie } = await login({ providerUserId: "validation-user-1" });

    await api
      .post("/api/listings")
      .set("Cookie", cookie)
      .send({ type: "lost" }) // missing latitude, longitude, nickname
      .expect(400);
  });

  it("returns 400 for out-of-range latitude", async () => {
    const { cookie } = await login({ providerUserId: "validation-user-2" });

    await api
      .post("/api/listings")
      .set("Cookie", cookie)
      .send({ ...minimalListing, latitude: 999 })
      .expect(400);
  });

  it("returns 400 when expiresAt is in the past", async () => {
    const { cookie } = await login({ providerUserId: "validation-user-3" });
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();

    await api
      .post("/api/listings")
      .set("Cookie", cookie)
      .send({ ...minimalListing, expiresAt: yesterday })
      .expect(400);
  });

  it("sets a privateToken for private listings", async () => {
    const { cookie } = await login({ providerUserId: "private-listing-user" });

    const res = await api
      .post("/api/listings")
      .set("Cookie", cookie)
      .send({ ...minimalListing, isPublic: false })
      .expect(201);

    expect(res.body.privateToken).toBeDefined();
    expect(res.body.isPublic).toBe(false);
  });

  it("does not set privateToken for public listings", async () => {
    const { cookie } = await login({ providerUserId: "public-listing-user" });

    const res = await api
      .post("/api/listings")
      .set("Cookie", cookie)
      .send(minimalListing)
      .expect(201);

    expect(res.body.privateToken).toBeUndefined();
  });
});

describe("GET /api/listings/:id", () => {
  it("returns 404 for a non-existent listing", async () => {
    await api.get("/api/listings/non-existent-id").expect(404);
  });

  it("returns the listing by ID", async () => {
    const { cookie } = await login({ providerUserId: "get-by-id-user" });
    const created = await api
      .post("/api/listings")
      .set("Cookie", cookie)
      .send(minimalListing)
      .expect(201);

    const res = await api.get(`/api/listings/${created.body.id}`).expect(200);
    expect(res.body.id).toBe(created.body.id);
  });
});

describe("PATCH /api/listings/:id", () => {
  let ownerId: string;
  let ownerCookie: string;
  let listingId: string;

  beforeAll(async () => {
    const session = await login({ providerUserId: "patch-owner" });
    ownerId = session.userId;
    ownerCookie = session.cookie;

    const created = await api
      .post("/api/listings")
      .set("Cookie", ownerCookie)
      .send(minimalListing)
      .expect(201);
    listingId = created.body.id;
  });

  it("returns 401 when not authenticated", async () => {
    await api.patch(`/api/listings/${listingId}`).send({ title: "X" }).expect(401);
  });

  it("returns 403 when a different user tries to edit", async () => {
    const other = await login({ providerUserId: "patch-other-user" });
    await api
      .patch(`/api/listings/${listingId}`)
      .set("Cookie", other.cookie)
      .send({ title: "Hacked" })
      .expect(403);
  });

  it("updates the listing when called by the owner", async () => {
    const res = await api
      .patch(`/api/listings/${listingId}`)
      .set("Cookie", ownerCookie)
      .send({ title: "Updated title", description: "New description" })
      .expect(200);

    expect(res.body.title).toBe("Updated title");
    expect(res.body.description).toBe("New description");
  });
});

describe("DELETE /api/listings/:id", () => {
  it("returns 401 when not authenticated", async () => {
    const { cookie } = await login({ providerUserId: "del-setup-user" });
    const created = await api
      .post("/api/listings")
      .set("Cookie", cookie)
      .send(minimalListing)
      .expect(201);

    await api.delete(`/api/listings/${created.body.id}`).expect(401);
  });

  it("returns 403 when a different user tries to delete", async () => {
    const owner = await login({ providerUserId: "del-owner-user" });
    const other = await login({ providerUserId: "del-other-user" });

    const created = await api
      .post("/api/listings")
      .set("Cookie", owner.cookie)
      .send(minimalListing)
      .expect(201);

    await api
      .delete(`/api/listings/${created.body.id}`)
      .set("Cookie", other.cookie)
      .expect(403);
  });

  it("deletes the listing when called by the owner", async () => {
    const { cookie } = await login({ providerUserId: "del-success-user" });

    const created = await api
      .post("/api/listings")
      .set("Cookie", cookie)
      .send(minimalListing)
      .expect(201);

    await api
      .delete(`/api/listings/${created.body.id}`)
      .set("Cookie", cookie)
      .expect(204);

    await api.get(`/api/listings/${created.body.id}`).expect(404);
  });
});

describe("PATCH /api/listings/:id/status", () => {
  it("marks a listing as resolved when called by the owner", async () => {
    const { cookie } = await login({ providerUserId: "status-user" });

    const created = await api
      .post("/api/listings")
      .set("Cookie", cookie)
      .send(minimalListing)
      .expect(201);

    const res = await api
      .patch(`/api/listings/${created.body.id}/status`)
      .set("Cookie", cookie)
      .send({ status: "resolved" })
      .expect(200);

    expect(res.body.status).toBe("resolved");
  });

  it("returns 403 when a non-owner tries to change status", async () => {
    const owner = await login({ providerUserId: "status-owner" });
    const other = await login({ providerUserId: "status-other" });

    const created = await api
      .post("/api/listings")
      .set("Cookie", owner.cookie)
      .send(minimalListing)
      .expect(201);

    await api
      .patch(`/api/listings/${created.body.id}/status`)
      .set("Cookie", other.cookie)
      .send({ status: "resolved" })
      .expect(403);
  });
});

describe("GET /api/listings/mine", () => {
  it("returns 401 when not authenticated", async () => {
    await api.get("/api/listings/mine").expect(401);
  });

  it("returns only the logged-in user's listings", async () => {
    const owner = await login({ providerUserId: "mine-owner" });
    const other = await login({ providerUserId: "mine-other" });

    await api.post("/api/listings").set("Cookie", owner.cookie).send(minimalListing);
    await api.post("/api/listings").set("Cookie", other.cookie).send(minimalListing);

    const res = await api
      .get("/api/listings/mine")
      .set("Cookie", owner.cookie)
      .expect(200);

    expect(res.body.every((l: { ownerId: string }) => l.ownerId === owner.userId)).toBe(true);
  });
});
