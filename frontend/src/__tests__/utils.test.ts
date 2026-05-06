import { describe, it, expect, beforeEach } from "vitest";
import { formatDate, setSiteOrigin, siteOrigin } from "../utils";

describe("formatDate", () => {
  it("formats a valid ISO date string in en-US locale", () => {
    const result = formatDate("2024-06-15T12:00:00.000Z", "en-US");
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2024/);
  });

  it("formats a valid ISO date string in pl-PL locale", () => {
    const result = formatDate("2024-06-15T12:00:00.000Z", "pl-PL");
    expect(result).toMatch(/2024/);
  });

  it("returns the original string for an invalid date", () => {
    const bad = "not-a-date";
    expect(formatDate(bad, "en-US")).toBe(bad);
  });

  it("handles an ISO date-only string (no time component)", () => {
    const result = formatDate("2023-01-01T12:00:00", "en-US");
    expect(result).toMatch(/2023/);
    expect(result).toMatch(/Jan/);
  });
});

describe("siteOrigin / setSiteOrigin", () => {
  beforeEach(() => {
    setSiteOrigin(""); // reset to default before each test
  });

  it("returns window.location.origin when no custom origin is set", () => {
    expect(siteOrigin()).toBe(window.location.origin);
  });

  it("returns the configured origin after setSiteOrigin", () => {
    setSiteOrigin("https://example.com");
    expect(siteOrigin()).toBe("https://example.com");
  });

  it("strips a trailing slash from the configured origin", () => {
    setSiteOrigin("https://example.com/");
    expect(siteOrigin()).toBe("https://example.com");
  });
});
