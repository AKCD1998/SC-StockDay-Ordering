import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("request summary panel", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.jsx"), "utf8");
  const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

  it("renders one connected four-row table from existing dialog values", () => {
    expect(appSource).toMatch(/className="rq-summary-table"/);
    expect(appSource).toMatch(/className="rq-dialog-summary-row rq-summary-branch-row"/);
    expect(appSource).toMatch(/className="rq-dialog-summary-row rq-summary-stock-row"/);
    expect(appSource).toMatch(/className="rq-dialog-summary-row rq-summary-total-label-row"/);
    expect(appSource).toMatch(/className="rq-dialog-summary-row rq-summary-total-row"/);
    expect(appSource).toMatch(/className="rq-summary-stock-num">\{formatNumber\(currentBranchStockQty, 0\)\}/);
    expect(appSource).toMatch(/className="rq-total-num">\{totalRequestedQty\}/);
    expect(appSource).toMatch(/\{branchCode \|\| "-"\}/);
    expect(appSource).toMatch(/\{requestDialogProduct\.unit \|\| "-"\}/);
    expect(appSource).not.toMatch(/[>{]\s*(?:XXX|00x|\{จำนวน\}|\{ชิ้น\})\s*[<}]/);
  });

  it("keeps equal cells in the first rows and full-width total rows", () => {
    const rowRule = stylesheet.match(/\.rq-dialog-summary-row\s*\{([^}]*)\}/)?.[1];
    const fullRowRule = stylesheet.match(/\.rq-summary-total-label-row,\s*\.rq-summary-total-row\s*\{([^}]*)\}/)?.[1];
    const tableRule = stylesheet.match(/\.rq-summary-table\s*\{([^}]*)\}/)?.[1];

    expect(rowRule).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/);
    expect(fullRowRule).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/);
    expect(tableRule).toMatch(/border-radius:\s*12px\s*;/);
    expect(tableRule).toMatch(/overflow:\s*hidden\s*;/);
  });

  it("stacks the summary below the table without collapsing its two-column rows", () => {
    expect(stylesheet).toMatch(/@media \(max-width: 720px\)[\s\S]*?\.rq-dialog-body\s*\{[^}]*display:\s*block\s*;[^}]*overflow-x:\s*hidden\s*;[^}]*\}/);
    expect(stylesheet).toMatch(/@media \(max-width: 720px\)[\s\S]*?\.rq-dialog-summary\s*\{[^}]*border-top:\s*1px\s+solid\s+#1a2b3c\s*;[^}]*border-left:\s*0\s*;[^}]*\}/);
  });
});
