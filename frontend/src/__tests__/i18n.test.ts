import { describe, it, expect } from "vitest";
import { en } from "../i18n/en";
import { pl } from "../i18n/pl";

const enKeys = Object.keys(en) as (keyof typeof en)[];
const plKeys = Object.keys(pl) as (keyof typeof pl)[];

describe("i18n key parity", () => {
  it("pl has all keys that en has", () => {
    const missing = enKeys.filter((k) => !(k in pl));
    expect(missing, `Keys in en but missing in pl: ${missing.join(", ")}`).toHaveLength(0);
  });

  it("en has all keys that pl has", () => {
    const extra = plKeys.filter((k) => !(k in en));
    expect(extra, `Keys in pl but missing in en: ${extra.join(", ")}`).toHaveLength(0);
  });

  it("en and pl agree on which keys are intentionally empty", () => {
    const emptyEn = enKeys.filter((k) => en[k] === "");
    const emptyPl = plKeys.filter((k) => pl[k] === "");
    const onlyInEn = emptyEn.filter((k) => !emptyPl.includes(k as never));
    const onlyInPl = emptyPl.filter((k) => !emptyEn.includes(k as never));
    expect(onlyInEn, `Keys empty in en but not pl: ${onlyInEn.join(", ")}`).toHaveLength(0);
    expect(onlyInPl, `Keys empty in pl but not en: ${onlyInPl.join(", ")}`).toHaveLength(0);
  });

  it("en and pl have the same number of keys", () => {
    expect(plKeys.length).toBe(enKeys.length);
  });
});

describe("i18n placeholder consistency", () => {
  it("every {placeholder} in en exists in the corresponding pl value", () => {
    const placeholderRe = /\{(\w+)\}/g;
    const mismatches: string[] = [];

    for (const key of enKeys) {
      const enVal = en[key];
      const plVal = pl[key as keyof typeof pl];
      if (typeof enVal !== "string" || typeof plVal !== "string") continue;

      const enPlaceholders = [...enVal.matchAll(placeholderRe)].map((m) => m[1]).sort();
      const plPlaceholders = [...plVal.matchAll(placeholderRe)].map((m) => m[1]).sort();

      if (JSON.stringify(enPlaceholders) !== JSON.stringify(plPlaceholders)) {
        mismatches.push(
          `"${key}": en has {${enPlaceholders.join(",")}} but pl has {${plPlaceholders.join(",")}}`,
        );
      }
    }

    expect(mismatches, mismatches.join("\n")).toHaveLength(0);
  });
});
