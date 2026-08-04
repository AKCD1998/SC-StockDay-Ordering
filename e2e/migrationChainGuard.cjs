"use strict";

// Guards against the exact staleness that caused CLAIM-C-033 (see
// _ledger/claude.md): config.cjs's curated MIGRATION_FILES list caps at an
// old migration number while the real migrations/ directory in
// PaaSRTSM-project keeps growing, and nothing ever notices until an
// application code path needs a column/table from a migration the curated
// list never picked up.
//
// This does NOT require the curated list to include every migration ever
// written (some are deliberately excluded — pgvector/embedding migrations
// the e2e harness has no model for, or migrations whose tables/features
// aren't exercised by any current e2e spec). It requires every exclusion to
// be NAMED and EXPLAINED, so a newly-added migration can never silently fall
// through a gap the way 037-065 did.

const fs = require("fs");
const path = require("path");

const MIGRATION_NUMBER_PATTERN = /^(\d{3})_.+\.sql$/;

function parseMigrationNumber(filename) {
  const match = MIGRATION_NUMBER_PATTERN.exec(filename);
  return match ? Number(match[1]) : null;
}

// curatedMigrationFiles: raw MIGRATION_FILES array from config.cjs (some
// entries have a "migrations/" prefix, one root-level entry does not —
// numbered migrations always live under migrations/, so the un-prefixed
// root entry naturally has no migration number and is ignored here).
function listRealMigrationNumbers(migrationsDir) {
  return fs
    .readdirSync(migrationsDir)
    .map((filename) => parseMigrationNumber(filename))
    .filter((n) => n !== null)
    .sort((a, b) => a - b);
}

function listCuratedMigrationNumbers(curatedMigrationFiles) {
  return curatedMigrationFiles
    .map((entry) => path.basename(entry))
    .map((filename) => parseMigrationNumber(filename))
    .filter((n) => n !== null);
}

// Returns { ok, gaps, curatedMax, realMax } — `gaps` is every real migration
// number that is present in the real directory but absent from BOTH the
// curated list and the explicit exclusion list, REGARDLESS of whether it
// falls below or above curatedMax.
//
// CORRECTED 2026-07-29 (see _ledger/claude.md CLAIM-C-038/X-036, PARTIAL,
// conceded): the first version of this function only checked gaps <=
// curatedMax, on the theory that "lagging behind the latest migration on
// purpose" should be allowed without comment. Codex proved that framing
// defeats the guard's entire purpose — a migration added ABOVE curatedMax
// (e.g. 066, when curatedMax is 49) was silently accepted with `ok: true`,
// which is the SAME "chain silently falls behind" failure class the guard
// exists to prevent (migration 037/048 both slipped through this way, just
// below a ceiling instead of above one). There is no such thing as an
// implicitly-fine gap anymore: every real migration number must be either
// in curatedMigrationFiles or in intentionallyExcluded, with a reason,
// however far above today's curated ceiling it is.
function checkMigrationChainCoverage({ migrationsDir, curatedMigrationFiles, intentionallyExcluded = [] }) {
  const realNumbers = listRealMigrationNumbers(migrationsDir);
  const curatedNumbers = new Set(listCuratedMigrationNumbers(curatedMigrationFiles));
  const excludedNumbers = new Set(intentionallyExcluded);

  const curatedMax = curatedNumbers.size > 0 ? Math.max(...curatedNumbers) : 0;
  const realMax = realNumbers.length > 0 ? Math.max(...realNumbers) : 0;

  const gaps = realNumbers.filter((n) => !curatedNumbers.has(n) && !excludedNumbers.has(n));

  return { ok: gaps.length === 0, gaps, curatedMax, realMax };
}

function formatGuardFailureMessage(result) {
  return (
    `e2e migration chain guard: ${result.gaps.length} migration(s) fall inside the curated ` +
    `range (up to ${result.curatedMax}) but are neither included nor explicitly excluded: ` +
    `${result.gaps.join(", ")}. Real migrations/ now goes up to ${result.realMax}. ` +
    "Add each one to MIGRATION_FILES in config.cjs, or to the intentionallyExcluded list " +
    "with a reason (see the comment above that list) — never let it fall through silently."
  );
}

module.exports = {
  parseMigrationNumber,
  listRealMigrationNumbers,
  listCuratedMigrationNumbers,
  checkMigrationChainCoverage,
  formatGuardFailureMessage,
};
