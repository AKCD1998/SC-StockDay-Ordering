# Event 015 — Existing-member lookup and SCCRM registration boundary

- Date: 15 November 2026
- Owner: Preorder web/API workstream
- Status: **Existing-member lookup implemented in draft PR #61; CI passed; new-member bridge not implemented**
- Backend commit: `9c206b1543198380cdfa6caf8670bf20590188c8` (`Add branch-scoped preorder member lookup`)
- PR: [PaaSRTSM-project #61](https://github.com/AKCD1998/PaaSRTSM-project/pull/61)
- CI: run [#43710628130](https://github.com/AKCD1998/PaaSRTSM-project/actions/runs/43710628130) passed

## Implemented in the API branch

- `GET /api/customer-preorders/members/lookup?phone=...` is available only to an authorized branch workspace with case-create capability. It normalizes Thai phone formats, exact-matches active SCCRM primary/linked phone numbers using the existing internal member-directory API, and returns only the member ID, display name and member code needed for selection.
- Results distinguish `none`, `single` and `multiple`. The member ID is not accepted on faith: when the case is submitted, the backend looks up that exact phone again, verifies the selected ID belongs to the result and stores its stable UUID in `customer_relations.preorder_cases.customer_member_id`. The canonical SCCRM name is saved with it; the phone entered for this preorder remains its contact phone.
- Migration `085_add_preorder_customer_member_id.sql` adds the nullable reference. It is review-only in PR #61 and has not been applied.
- No member data is copied into a new directory or mirrored into the mobile app by this change. It does not write to SCCRM or ADA.

## Source evidence and correction

The current SCCRM/PaaS source already has an internal, read-only member-directory endpoint, and the PaaS environment already configures its server-side URL/token. The new Preorder lookup calls that existing path; it does not depend on an ADA Cloud API.

The current SCCRM member-registration route is a separate write path. Source at `AKCD1998/SC-official-website` commit `16b124882fe0453b494260a778154afb19c3931c` (`backend/routes/crmMembers.js`, `backend/lib/memberRegistrations.js`) requires an authorized staff-device bearer, member phone/name, date of birth and `consents.pdpa_general`; it records registration through the existing history-first enqueue. This Preorder adapter has no delegated create-member credential or route, and the request UI specified to date only asks the operator for phone and name. Do not claim a no-match creates a real SCCRM member or that an ADA/branch sync receipt has been observed.

The separate `AKCD1998/SCCRMonPOS` source at `095e3a1278b7dd672d36f10c1edb813d682e066c` documents an existing HQ-to-branch member fanout and an Ada member/history bridge (`sync-agent/live/WORK_STATUS.md`, `FAST_MEMBERS.md`, `sync-agent/README.md`). That changes the integration question: the known source path is SCCRM registration into the existing company sync, not a newly invented Ada writer. Source documentation is not a live health check or delivery receipt for a particular new member.

## Business decision required for a safe create-member bridge

The no-match dialog currently promises **สร้างสมาชิกใหม่**, but the available SCCRM create route requires DOB and explicit general PDPA consent in addition to phone/name. Before implementing the bridge, the product flow must say whether:

1. the operator collects DOB and records the customer’s general PDPA consent in the PDA, then SCCRM registration uses an authorized server-side actor with audit attribution; or
2. the no-match option creates only a preorder contact (phone/name) and does not enroll the person as an SCCRM member.

Do not bypass the existing staff-device credential or manufacture consent. If option 1 is selected, keep the DOB/consent collection and member creation behind a specific, auditable endpoint; then return/track the existing sync system’s actual status rather than claiming branch delivery immediately. The downstream sync agent should be checked operationally before presenting a successful fanout receipt.

## Remaining gates

- PDA owner must review and integrate the API contract; no Android client change is included in this Preorder branch.
- Draft PR #61 remains unmerged and undeployed, feature flags remain off, and migration 085 remains unapplied.
- Existing-member lookup does not complete the member-create, ADA delivery, branch fanout, or mobile notification flow.
