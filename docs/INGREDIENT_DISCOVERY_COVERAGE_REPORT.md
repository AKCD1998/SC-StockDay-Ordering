# Ingredient Discovery Coverage Report

Date: 2026-06-08

## Scope

This report estimates how much of the catalog can be **automatically proposed**
by the current ingredient knowledge dictionary, before any write APIs or backfill
jobs are built. It is a **read-only** investigation — nothing was written to the
database.

- Catalog scanned: `ada.branch_stock_snapshots` (the product-code universe used by
  the review queue), matching the review-queue scope.
- Dictionary scanned: `knowledge.ingredient_synonyms` joined to
  `knowledge.ingredients` (active synonyms only).
- Matching: a product is "matched" if any active synonym appears as a whole-token
  substring in its English (falling back to Thai) product name.

Reproduce with:

```powershell
cd "C:\Users\scgro\Desktop\Webapp training project\PaaSRTSM-project"
node scripts/ingredient_discovery_coverage.js --top 100
# curated-candidate projection:
node scripts/ingredient_discovery_coverage.js --top 1 --candidates paracetamol,amoxicillin,...
```

Script: `PaaSRTSM-project/scripts/ingredient_discovery_coverage.js`

## Headline Result

```text
Total Products:            6508

Matched (1+ ingredient):   17
Matched (2+ ingredients):  1
Unmatched:                 6491

Coverage:                  0.26%
```

The current dictionary holds only the LODOS seed ingredients
(Bisoprolol + Hydrochlorothiazide), so coverage is effectively zero. This is
expected — the point of this pass is to size the gap and prioritize what to add.

## Most Common Matched Ingredients (current dictionary)

| Ingredient | Products matched | % of catalog |
| --- | ---: | ---: |
| Hydrochlorothiazide | 11 | 0.17% |
| Bisoprolol | 7 | 0.11% |

Only 2 of the seeded ingredients matched any product. (Of the 17 matched
products, 1 contains both — the LODOS combination.)

## Most Common Unmatched Words (raw)

The raw top-100 unmatched tokens are **dominated by brand/manufacturer names and
dose-form/marketing noise**, not active ingredients. Top of the raw list:

| # | Token | Unmatched products | % | Kind |
| --- | --- | ---: | ---: | --- |
| 1 | tman | 140 | 2.15% | brand |
| 2 | brand | 129 | 1.98% | noise |
| 3 | siam | 122 | 1.87% | brand/mfr |
| 4 | vitamin | 115 | 1.77% | **ingredient/category** |
| 5 | biopharm | 100 | 1.54% | mfr |
| 6 | orange | 96 | 1.48% | flavor |
| 7 | support | 95 | 1.46% | noise |
| 8 | dksh | 92 | 1.41% | distributor |
| 9 | reckitt / benckiser | 90 / 89 | 1.38% | mfr |
| 12 | **paracetamol** | 87 | 1.34% | **ingredient** |

Full top-100 is printed by the script. The key takeaway: **raw token frequency is
not a good ranking for ingredient discovery** — manufacturer names (tman, siam,
biopharm, dksh, reckitt, benckiser, bangkok, greater, berlin, abbott, bayer,
sanofi, pfizer, menarini, organon, …) and packaging/marketing words (support,
flavor, mask, balm, dressing, smooth, cool, …) crowd out the real signal.

### Ingredient signals embedded in the unmatched list

Filtering the unmatched tokens down to genuine active ingredients / clinically
meaningful terms (by document frequency = distinct unmatched products):

| Token | Products | Token | Products |
| --- | ---: | --- | ---: |
| paracetamol | 87 | cetirizine | 21 |
| amoxicillin | 44 | collagen | 20 |
| zinc | 41 | bromhexine | 18 |
| diclofenac | 39 | loratadine | 18 |
| ibuprofen | 38 | menthol | 18 |
| calcium | 32 | simethicone | 17 |
| clotrimazole | 29 | amlodipine | 16 |
| triamcinolone | 29 | magnesium | 16 |
| betamethasone | 27 | pregabalin | 16 |
| metformin | 24 | dextromethorphan | 14 |
| atorvastatin | 23 | lactulose | 14 |
| ketoconazole | 23 | omeprazole | 14 |
| glucose | 23 | clavulanic | 22* |
| clav/etoricoxib | 22 | acetylcysteine | 21 |
| glucosamine | 22 | | |

\* `clavulanic` almost always co-occurs with `amoxicillin` (co-amoxiclav), so it
adds only +1 net product once `amoxicillin` is added.

Note: `acid`, `sodium`, `chloride`, `hydrochloride` rank high but are **salt
forms / modifiers** (e.g. "diclofenac sodium", "ascorbic acid"), not standalone
ingredients — treat them as part of multi-word synonyms, not as single-token
ingredients.

## Recommendations — what to add first

Adding ingredient synonyms in the order below (greedy, deduped for product
overlap) yields this **projected cumulative coverage** if each token were a
recognized ingredient synonym:

| Rank | Ingredient | New products | Cumulative coverage |
| ---: | --- | ---: | ---: |
| 1 | vitamin\* | +115 | 1.77% |
| 2 | paracetamol | +87 | 3.10% |
| 3 | alcohol\* | +60 | 4.03% |
| 4 | sodium\* | +55 | 4.87% |
| 5 | amoxicillin | +44 | 5.55% |
| 6 | ibuprofen | +37 | 6.12% |
| 7 | zinc | +36 | 6.67% |
| 8 | diclofenac | +35 | 7.21% |
| 9 | triamcinolone | +29 | 7.65% |
| 10 | clotrimazole | +29 | 8.10% |
| 11 | calcium | +27 | 8.51% |
| 12 | metformin | +24 | 8.88% |
| 13 | ketoconazole | +23 | 9.23% |
| 14 | betamethasone | +22 | 9.57% |
| 15 | atorvastatin | +22 | 9.91% |
| 16 | etoricoxib | +22 | 10.25% |
| 17 | glucosamine | +22 | 10.59% |
| 18 | acetylcysteine | +21 | 10.91% |
| 19 | cetirizine | +21 | 11.23% |
| 20 | collagen\* | +20 | 11.54% |
| 21 | menthol | +18 | 11.82% |
| 22 | loratadine | +18 | 12.09% |
| 23 | bromhexine | +18 | 12.37% |
| 24 | simethicone | +17 | 12.63% |
| 25 | amlodipine | +16 | 12.88% |
| 26 | pregabalin | +16 | 13.12% |
| 27 | omeprazole | +14 | 13.34% |
| 28 | lactulose | +14 | 13.55% |
| 29 | magnesium | +11 | 13.72% |
| 30 | dextromethorphan | +9 | 13.86% |
| 31 | clavulanic | +1 | 13.88% |

\* `vitamin`, `alcohol`, `sodium`, `collagen`, `calcium`, `magnesium` are
**category/salt/supplement** terms rather than single active ingredients. They
cover many products but should be modeled carefully (e.g. `vitamin` → a vitamins
category or split into vitamin C / B-complex / D; `alcohol` → ethyl alcohol
antiseptic; `sodium`/`chloride` → saline / salt forms).

### Interpretation

- **~31 well-chosen ingredient terms reach ~14% of the catalog.** Pure
  single-active-ingredient drugs (paracetamol → omeprazole list, excluding the
  starred category terms) account for roughly **9–10%** on their own.
- The long tail is heavy: after the top ~30, each additional ingredient adds only
  a handful of products. Reaching high coverage (>50%) by ingredient terms alone
  is unrealistic because a large share of the catalog is **non-drug** items —
  medical supplies (dressings, gauze, gloves, syringes, catheters, braces:
  tubigrip, tynor, actimove, futuro), devices (thermometers, BP monitors:
  omron, beurer; wheelchairs, commodes), cosmetics/personal care, and
  supplements/herbals.

### Suggested rollout order

1. **Seed the top ~20 single-active-ingredient terms** (paracetamol, amoxicillin,
   ibuprofen, diclofenac, clotrimazole, triamcinolone, betamethasone, metformin,
   atorvastatin, ketoconazole, etoricoxib, acetylcysteine, cetirizine, loratadine,
   bromhexine, simethicone, amlodipine, pregabalin, omeprazole, dextromethorphan),
   each with their salt-form synonyms (e.g. "diclofenac sodium", "amoxicillin
   trihydrate"). This is high-confidence, clinically clean, ~9–10% coverage.
2. **Model the category/salt terms deliberately** (vitamin*, calcium, magnesium,
   zinc, collagen, glucosamine, alcohol, saline) — these are valuable but need
   human-curated mapping to drug class / supplement category, not naïve single-API
   treatment.
3. **Do not chase brand tokens as ingredients.** Manufacturer/brand names
   (tman, siam, biopharm, dksh, reckitt, etc.) are better handled by a supplier
   dictionary, not the ingredient layer.
4. **Accept a structural ceiling:** a significant fraction of the catalog is
   non-drug (supplies/devices/cosmetics) and will never match an active
   ingredient. Coverage targets should be set against the *drug* subset, not the
   full 6,508.

## Method Notes & Caveats

- **Token boundary matching** uses whole-token substring on a Latin-normalized,
  space-padded name string, so "sodium" will not match inside another word but
  multi-word synonyms ("bisoprolol fumarate") match exactly.
- **Stopwords**: units (mg, ml…), dose forms (tab, cap, syrup…), packaging
  (box, strip, vial…) and generic marketing words are excluded from the
  unmatched-token ranking; tokens shorter than 4 characters are dropped.
- **Document frequency** counts distinct *unmatched* products containing a token,
  so the recommendation reflects net new coverage, with greedy overlap removal in
  the cumulative column.
- **`skus.generic_name` is 100% NULL** in this database, confirming it cannot be
  used as an ingredient source — name-text scanning is the only signal available
  today.
- Numbers reflect catalog state on 2026-06-08; re-run the script after catalog or
  dictionary changes.
