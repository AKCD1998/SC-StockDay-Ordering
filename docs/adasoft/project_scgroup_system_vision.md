---
name: sc-group-system-vision-2026
description: "Full updated system vision for SC Group operational platform (2026). Five-component architecture: PaaSRTSM (central nervous system), SCCRMonPOS (branch sensor/bridge), Rx1011 (lot/expiry operational workflow module — mature, NOT obsolete), SC-StockDay (reconciliation engine), SCCRMMVP (mobile CRM). AdaAcc always read-only. Event-driven integration. Corrections are events not overwrites. Thai-first UX."
metadata: 
  node_type: memory
  type: project
  originSessionId: 4eb79e91-534f-4357-83ab-417e0a3131b1
---

## Core philosophy

AdaPos/AdaAcc remains: accounting system, cashier/tax/compliance, legacy ERP/POS source.
We build around it to capture: operational reality, reconciliation, auditability, branch accountability, CRM/customer intelligence, inventory truth, workflow intelligence.
AdaAcc is ALWAYS READ-ONLY. No exceptions.

---

## Five-component architecture

### PaaSRTSM — Central nervous system
- Shared PostgreSQL, shared auth/JWT
- Branch/staff identity, product master
- CRM/loyalty, reconciliation engine, analytics, audit trail
- Sync ingestion API, event normalization
- Branch ordering domain, future automation endpoints

### SCCRMonPOS — Sensor and transport bridge
- Read AdaAcc read-only: detect sales, transfer docs, unprocessed receipts
- Queue/sync events to PaaSRTSM
- Survive unstable internet with offline queue/retry
- NOT the business workflow engine

### Rx1011 — Specialized operational workflow module
- NOT obsolete. NOT being replaced immediately.
- Contains mature operational philosophy:
  - Lot-aware inventory truth
  - Expiry-aware workflows
  - Send/receive confirmation
  - Audit-first corrections
  - Branch accountability
  - Operational verification
  - Discrepancy-conscious workflows
- Should heavily influence: SC-StockDay workflow philosophy, reconciliation UX, audit/event architecture, confirmation patterns
- Evolves into specialized operational module connected to ecosystem
- Think: "high-control inventory workflow module" NOT "legacy app waiting to die"

### SC-StockDay — Reconciliation engine
- Records operational truth AdaPos cannot represent:
  - Actual received qty (FCPthQtyRcv doesn't exist in AdaAcc)
  - Discrepancy qty, lot mismatch, damaged goods
  - Approval chain, receipt confirmation
  - Transfer event history
  - Linkage between adjustments and original transfers
- Does NOT replace AdaPos stock/accounting
- AdaPos remains: accounting endpoint, cashier system, tax/compliance

### SCCRMMVP — Mobile CRM
- Customer mode: points, tiers, history, rewards
- Staff mode: lookup, add/redeem points, register members
- Talks only to PaaSRTSM API

---

## Critical operational philosophy

**Never silently fix stock.**
- Preserve original events
- Record discrepancies with reasons
- Preserve timelines and accountability
- Corrections are EVENTS, not overwrites
- Operational truth matters more than making numbers look correct

---

## Integration philosophy — event-driven

```
AdaAcc sale
↓
SCCRMonPOS detects
↓
PaaSRTSM receives normalized event
↓
if product belongs to Rx1011-controlled group → emit Rx1011 operational event
if transfer-related → emit reconciliation event
CRM/analytics/audit update automatically
```

Avoid: double entry, separate manual recording, parallel inconsistent truths.

---

## UX philosophy

- Thai-first, operationally lean, low-click, scan-first
- Mobile/tablet friendly, branch-friendly, fast under real store conditions
- Confirmation by exception
- Progressive disclosure
- Minimize typing, preserve auditability without burdening staff
- Goal: "minimum staff effort, maximum operational truth"

---

## Long-term vision

```
AdaAcc
↓
SCCRMonPOS
↓
PaaSRTSM operational platform
├── CRM / loyalty (SCCRMMVP frontend)
├── SC-StockDay reconciliation
├── Rx1011 operational workflows
├── analytics
├── audit engine
├── future automation
└── AI-assisted operations
```

Evolve carefully. Preserve operational trust.
Do NOT rewrite everything immediately, merge repos blindly, destroy proven workflows, or create duplicate product masters.

---

## Unknown — needs investigation
- Rx1011 repo: location and current state not yet scanned
