# SC App Center storefront

User requested a company app store and then clarified that it should resemble familiar Google Play/App Store browsing. Reviewed actual product-page screenshots (Google Play WhatsApp/Apple ChatGPT) plus Apple’s product-page guidance before the revised UI.

- Dedicated authenticated storefront at `#/app-center`, separate from the StockDay admin header/navigation while keeping its existing session. Account menu returns to StockDay or signs out.
- Apps screen: working search, SC blue/yellow feature banner and actual published-app rows. Initial catalog contains SCPDA only; no invented app counts, reviews, ratings or popularity claims.
- App detail screen: publisher, install action, factual platform/size, horizontally browsable screenshots of SC’s own app, release notes and app information. Screenshots open a larger viewer; browser Back returns to the list.
- Updates screen: published release notes and collapsible version history. Website does not claim to know which apps are installed on a phone. Its Install action downloads an APK; the native SCPDA updater separately knows the installed version and shows Update only for a higher versionCode.
- Manage tab is admin-only: upload signed APK as draft, review, publish, stop distribution. Drafts never appear in branch catalog responses.
- SC logos and app screenshots are existing SC assets/test captures. Reference screenshots from third parties are kept only in the executor research folder, not shipped in product assets.

References: https://github.com/tryzealot/zealot (MIT distribution workflow); https://github.com/jenly1314/AppUpdater (MIT download/installer pattern); https://developer.apple.com/app-store/product-page/ (product-page hierarchy); https://m3.material.io/components/app-bars/ (search/header hierarchy). APK parsing actually reuses Apache2 `@devicefarmer/adbkit-apkreader@3.2.4` in backend PR65.

Verified revised UI through actual React → isolated HTTP/Postgres with synthetic private object storage and the signed R15 APK:7 checks passed for admin draft/publication, branch isolation, search/detail/preview/back, byte-identical download and320/390/496px layouts.15 existing navigation tests and frontend build passed before the visual revision; production build passed again with the final storefront. Source fixtures contain no production identity or credentials. Physical Android installation remains a separate acceptance step.
