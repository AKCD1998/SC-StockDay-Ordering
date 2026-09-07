import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("procurement toggle styling", () => {
  const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

  it("keeps the procurement toggle square with a matching one-pixel border", () => {
    const toggleRule = stylesheet.match(/\.rq-procurement-toggle\s*\{([^}]*)\}/)?.[1];

    expect(toggleRule).toBeDefined();
    expect(toggleRule).toMatch(/border:\s*1px\s+solid\s+#dc2626\s*;/);
    expect(toggleRule).toMatch(/border-radius:\s*0\s*;/);
  });

  it("keeps the procurement border matched to every button state", () => {
    expect(stylesheet).toMatch(/\.rq-procurement-toggle:hover\s*\{\s*border-color:\s*#b91c1c;\s*background:\s*#b91c1c;\s*\}/);
    expect(stylesheet).toMatch(/\.rq-procurement-toggle\.active\s*\{\s*border-color:\s*#6b7280;\s*background:\s*#6b7280;\s*\}/);
    expect(stylesheet).toMatch(/\.rq-procurement-toggle\.active:hover\s*\{\s*border-color:\s*#4b5563;\s*background:\s*#4b5563;\s*\}/);
  });

  it("keeps the recommendation card flush and uses a subtle border", () => {
    const recommendationRule = stylesheet.match(/\.rq-recommendation-card\s*\{([^}]*)\}/)?.[1];

    expect(recommendationRule).toBeDefined();
    expect(recommendationRule).toMatch(/margin:\s*0\s+0\s+8px\s*;/);
    expect(recommendationRule).toMatch(/border:\s*1px\s+solid\s+rgba\(59,\s*130,\s*246,\s*0\.18\)\s*;/);
    expect(recommendationRule).toMatch(/border-top:\s*none\s*;/);
    expect(recommendationRule).toMatch(/border-radius:\s*0\s*;/);
  });
});
