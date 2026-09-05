import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("procurement toggle styling", () => {
  const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

  it("lets the connected controls paint beneath the branch-table scrollbar", () => {
    const branchTableRule = stylesheet.match(/\.rq-branch-table\s*\{([^}]*)\}/)?.[1];

    expect(branchTableRule).toBeDefined();
    expect(branchTableRule).toMatch(/--rq-scrollbar-width:\s*8px\s*;/);
    expect(branchTableRule).toMatch(/overflow-x:\s*hidden\s*;/);
  });

  it("keeps the procurement toggle square so it joins flush with its card", () => {
    const toggleRule = stylesheet.match(/\.rq-procurement-toggle\s*\{([^}]*)\}/)?.[1];

    expect(toggleRule).toBeDefined();
    expect(toggleRule).toMatch(/width:\s*calc\(100%\s*\+\s*var\(--rq-scrollbar-width\)\)\s*;/);
    expect(toggleRule).toMatch(/border-radius:\s*0\s*;/);
  });

  it("keeps the recommendation card flush and uses a subtle border", () => {
    const recommendationRule = stylesheet.match(/\.rq-recommendation-card\s*\{([^}]*)\}/)?.[1];

    expect(recommendationRule).toBeDefined();
    expect(recommendationRule).toMatch(/width:\s*calc\(100%\s*\+\s*var\(--rq-scrollbar-width\)\)\s*;/);
    expect(recommendationRule).toMatch(/margin:\s*0\s+0\s+8px\s*;/);
    expect(recommendationRule).toMatch(/border:\s*1px\s+solid\s+rgba\(59,\s*130,\s*246,\s*0\.18\)\s*;/);
    expect(recommendationRule).toMatch(/border-top:\s*none\s*;/);
    expect(recommendationRule).toMatch(/border-radius:\s*0\s*;/);
  });
});
