import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("procurement toggle styling", () => {
  const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

  it("uses a proportional dialog grid with one divider owned by the summary column", () => {
    const dialogBodyRule = stylesheet.match(/\.rq-dialog-body\s*\{([^}]*)\}/)?.[1];
    const summaryRule = stylesheet.match(/\.rq-dialog-summary\s*\{([^}]*)\}/)?.[1];

    expect(dialogBodyRule).toBeDefined();
    expect(dialogBodyRule).toMatch(/display:\s*grid\s*;/);
    expect(dialogBodyRule).toMatch(/grid-template-columns:\s*minmax\(0,\s*2fr\)\s+minmax\(0,\s*1fr\)\s*;/);
    expect(stylesheet).not.toMatch(/\.rq-dialog-body::after\s*\{/);
    expect(summaryRule).toBeDefined();
    expect(summaryRule).toMatch(/width:\s*100%\s*;/);
    expect(summaryRule).toMatch(/border-left:\s*1px\s+solid\s+#1a2b3c\s*;/);
    expect(summaryRule).not.toMatch(/width:\s*220px\s*;/);
  });

  it("keeps the scroll area inside the branch-table boundary without a visible gutter", () => {
    const branchTableRule = stylesheet.match(/\.rq-branch-table\s*\{([^}]*)\}/)?.[1];

    expect(branchTableRule).toBeDefined();
    expect(branchTableRule).toMatch(/min-width:\s*0\s*;/);
    expect(branchTableRule).toMatch(/overflow-x:\s*hidden\s*;/);
    expect(branchTableRule).toMatch(/scrollbar-width:\s*none\s*;/);
    expect(stylesheet).toMatch(/\.rq-branch-table::-webkit-scrollbar\s*\{[^}]*width:\s*0\s*;[^}]*height:\s*0\s*;[^}]*\}/s);
  });

  it("lets the procurement toggle bleed one pixel under both table edges", () => {
    const toggleRule = stylesheet.match(/\.rq-procurement-toggle\s*\{([^}]*)\}/)?.[1];

    expect(toggleRule).toBeDefined();
    expect(toggleRule).toMatch(/appearance:\s*none\s*;/);
    expect(toggleRule).toMatch(/-webkit-appearance:\s*none\s*;/);
    expect(toggleRule).toMatch(/width:\s*calc\(100%\s*\+\s*2px\)\s*;/);
    expect(toggleRule).toMatch(/margin-left:\s*-1px\s*;/);
    expect(toggleRule).toMatch(/border:\s*1px\s+solid\s+#dc2626\s*;/);
    expect(toggleRule).toMatch(/border-radius:\s*0\s*;/);
  });

  it("keeps the procurement border matched to every button state", () => {
    expect(stylesheet).toMatch(/\.rq-procurement-toggle:hover\s*\{\s*border-color:\s*#b91c1c;\s*background:\s*#b91c1c;\s*\}/);
    expect(stylesheet).toMatch(/\.rq-procurement-toggle\.active\s*\{\s*border-color:\s*#6b7280;\s*background:\s*#6b7280;\s*\}/);
    expect(stylesheet).toMatch(/\.rq-procurement-toggle\.active:hover\s*\{\s*border-color:\s*#4b5563;\s*background:\s*#4b5563;\s*\}/);
  });

  it("lets the recommendation card bleed equally under both table edges", () => {
    const recommendationRule = stylesheet.match(/\.rq-recommendation-card\s*\{([^}]*)\}/)?.[1];

    expect(recommendationRule).toBeDefined();
    expect(recommendationRule).toMatch(/width:\s*calc\(100%\s*\+\s*2px\)\s*;/);
    expect(recommendationRule).toMatch(/margin:\s*0\s+0\s+8px\s+-1px\s*;/);
    expect(recommendationRule).toMatch(/border:\s*1px\s+solid\s+rgba\(96,\s*165,\s*250,\s*0\.34\)\s*;/);
    expect(recommendationRule).toMatch(/border-top:\s*none\s*;/);
    expect(recommendationRule).toMatch(/border-right-color:\s*transparent\s*;/);
    expect(recommendationRule).toMatch(/border-left-color:\s*transparent\s*;/);
    expect(recommendationRule).toMatch(/border-radius:\s*0\s*;/);
    expect(recommendationRule).toMatch(/background:\s*rgba\(37,\s*99,\s*235,\s*0\.2\)\s*;/);
  });
});
