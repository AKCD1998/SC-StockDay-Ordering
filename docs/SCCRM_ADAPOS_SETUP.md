# SCCRM combined installer

The admin-only StockDay **ลูกค้าสัมพันธ์ → แอดมิน** page offers one Windows
installer. From release 1.3.2 it includes native AdaPos connection setup; the
separate Branch 005 ZIP download has been removed from the page.

Exit SCCRM, download the Windows installer, and follow the wizard. Its existing
company device policy still applies. It discovers the local database connection
from existing SCCRM/StockDay settings, verifies read-only SQL access and receipt
tables, backs up configuration, and enables the watcher before installation can
finish. If no suitable connection exists, it asks the local administrator for a
read-only database account. The website carries no database passwords or tokens.

Existing staff sessions and unrelated local settings are preserved. New staff
devices still require their normal staff PIN. No AdaAcc data is modified, no SQL
users are created, and other app versions remain usable without forced updates.

The signed release catalog continues to supply installer URLs and publication
dates. The combined-setup wording appears only for versions 1.3.2 and newer;
older/rollback recommendations do not claim this capability. The same admin
authorization and server-revocation behavior cover these instructions.

Native implementation and verification details are in SCCRMonPOS's
`docs/INSTALLER.md`. Publishing the download is distinct from proving a local
Branch 005 installation and a member-linked real receipt.
