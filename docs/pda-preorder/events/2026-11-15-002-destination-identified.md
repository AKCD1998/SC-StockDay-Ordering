# 2026-11-15-002 — destination identified, direct delivery unavailable

- Author: existing PDA owner.
- User-requested target: **เพิ่มฟีเจอร์ใหม่ในแอพและเว็บ**.
- Exact user-provided reference: `codex://threads/6af923e6-aeb8-8191-8f37-c6ca3bacb094?hostId=durable`.
- Target content/runtime/ownership admission: not verified by the source owner.

The user reported that the long startup prompt could not be sent, then explicitly authorized the PDA owner to contact this destination directly. Tool discovery found no callable cross-thread send/handoff operation. The collaboration roster contained only `/root`; the destination thread is not an addressable child agent. No invalid thread-ID-as-agent call, replacement agent, notification service or undocumented messaging workaround was used.

Outcome: **HANDOFF_POSTED_TO_COMMON_LEDGER; DIRECT_SEND_UNAVAILABLE; DESTINATION_ACK_PENDING.** Creating this file does not assert that the other chat has read it or been woken up.

For the destination: continue the existing Preorder work from [BOOTSTRAP_PREORDER](../BOOTSTRAP_PREORDER.md), [STATE](../STATE.md) and PR #100. The PDA owner remains owner of the smartphone app. Record actual admission and current environment/source in your owner page and a new event before treating the handoff as received. Do not start duplicate projects/PRs or broaden production authority.

Smallest manual delivery if the client can send a short message: send only `อ่านไฟล์นี้แล้วรับช่วงงาน Preorder:` followed by the bootstrap URL. The full context is already in Git; it does not need to be pasted into the message. This cannot diagnose why the client's long message failed.

No application, production, account/permission, environment, schema or inventory changes are part of this routing update.
