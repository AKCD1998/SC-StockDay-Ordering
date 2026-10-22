# SCCRM AdaPos connection setup download

The admin-only StockDay **แอดมิน** page offers a Branch 005 connection helper
below the existing Windows installer. This is a separate post-install setup
download, not a replacement for the signed desktop updater or installer.

- Target: approved POSSRV, Branch 005, Tailscale `100.106.107.80`.
- Required installed application: SCCRMonPOS 1.3.1. The helper checks its exact
  executable hash and device policy before applying configuration.
- Asset: [Branch 005 setup v2](https://github.com/AKCD1998/SCCRMonPOS/releases/download/pos-1.3.1/SCCRMonPOS-Branch005-Setup-20261022-v2.zip).
- The helper uses the existing local StockDay agent's read-only SQL identity;
  the website and download contain no database password or staff session.
- Exit SCCRM, extract the ZIP locally, and run `Setup-SCCRMonPOS-005.cmd`.
  Leave AdaPos running. The helper verifies read-only permissions, backs up the
  application configuration, preserves the saved staff session, enables the
  watcher, and opens SCCRM. It does not write to AdaAcc.
- Other branches, other app versions, existing private SCCRM configuration,
  or failed permission checks require administrator review. The helper stops
  rather than replacing an existing secrets file.

The download card appears for the recommended 1.3.1 installer only, because this
helper requires that exact application. A future recommendation hides the card
until a matching setup flow is provided. Existing download authorization and
server-revocation behavior also govern this card.

The helper's Windows PowerShell 5.1 validation and remote SQL read-only checks
have passed. Applying it locally on Branch 005 and verifying a real receipt in
the member's history remain separate operational checks; the download card is
not evidence that those checks have completed.
