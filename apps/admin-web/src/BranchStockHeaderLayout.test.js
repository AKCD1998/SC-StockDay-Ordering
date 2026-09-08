import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("branch stock header layout", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.jsx"), "utf8");
  const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

  it("uses page-specific groups and keeps the requested action order", () => {
    expect(appSource).toMatch(/panel-header stacked branch-stock-panel-header/);
    expect(appSource).toMatch(/className="branch-stock-header-info"/);
    expect(appSource).toMatch(/className="branch-stock-search-row"/);
    expect(appSource).toMatch(/className="branch-stock-action-row"/);
    expect(appSource).toMatch(
      /branch-stock-action-row[\s\S]*?excel-export-button[\s\S]*?request-entry-button[\s\S]*?branch-stock-refresh-button/,
    );
  });

  it("scopes the desktop grid and equal action buttons to the branch-stock header", () => {
    const headerRule = stylesheet.match(
      /\.branch-stock-panel > \.branch-stock-panel-header\s*\{([^}]*)\}/,
    )?.[1];
    const actionRule = stylesheet.match(
      /\.branch-stock-panel-header \.branch-stock-action-row\s*\{([^}]*)\}/,
    )?.[1];
    const searchBarRule = stylesheet.match(
      /\.branch-stock-panel-header \.branch-stock-search-row\s*\{([^}]*)\}/,
    )?.[1];
    const searchInputRule = stylesheet.match(
      /\.branch-stock-panel-header \.branch-stock-search-row input\s*\{([^}]*)\}/,
    )?.[1];

    expect(headerRule).toMatch(/display:\s*grid\s*;/);
    expect(headerRule).toMatch(/grid-template-columns:\s*minmax\(0,\s*0\.85fr\)\s+minmax\(0,\s*1\.25fr\)\s+minmax\(0,\s*2\.2fr\)\s*;/);
    expect(actionRule).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*;/);
    expect(searchBarRule).toMatch(/display:\s*flex\s*;/);
    expect(searchBarRule).toMatch(/border:\s*1px solid #c8d3e2\s*;/);
    expect(searchBarRule).toMatch(/padding:\s*4px\s*;/);
    expect(searchInputRule).toMatch(/background:\s*transparent\s*;/);
    expect(searchInputRule).toMatch(/border:\s*0\s*;/);
    expect(searchInputRule).toMatch(/text-overflow:\s*ellipsis\s*;/);
    expect(stylesheet).toMatch(/\.branch-stock-panel-header \.branch-stock-search-row:focus-within\s*\{[^}]*border-color:\s*#4d90ff\s*;/s);
    expect(stylesheet).toMatch(
      /\.branch-stock-panel > \.branch-stock-panel-header \.branch-stock-refresh-button\s*\{[^}]*background:\s*linear-gradient\([^}]*#fff7b8[^}]*#f3e27b[^}]*\)[^}]*color:\s*#3d3300\s*;/s,
    );
  });

  it("moves controls below at medium widths and prevents narrow overflow", () => {
    expect(stylesheet).toMatch(
      /@media \(max-width: 1200px\)[\s\S]*?\.branch-stock-panel-header \.branch-stock-toolbar,[\s\S]*?grid-column:\s*1 \/ -1\s*;/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.branch-stock-panel > \.branch-stock-panel-header,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.branch-stock-panel-header \.branch-stock-action-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/,
    );
  });
});
