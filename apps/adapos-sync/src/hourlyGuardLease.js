import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const fail = code => { throw Object.assign(new Error("Guard child ownership is unavailable; details withheld."), { code }); };
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; return null; } };
// A failed kill may never turn into an unbounded series of orphan children.
// An incomplete lease, denied PID probe or reused PID requires administrator
// review. No foreign process is killed, and no ACL or task is changed.
export function createHourlyGuardLease(file, { pidAlive = alive } = {}) {
  return { acquire() {
    const nonce = randomUUID();
    const ownerFile = path.join(file, nonce + ".owner");
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        fs.mkdirSync(file);
        const fd = fs.openSync(ownerFile, "wx", 0o600);
        try { fs.writeFileSync(fd, JSON.stringify({ parentPid: process.pid, childPid: null, nonce })); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        return {
          setChild(childPid) {
            if (!Number.isSafeInteger(childPid) || childPid < 1) fail("GUARD_LEASE_UNVERIFIED");
            const current = JSON.parse(fs.readFileSync(ownerFile, "utf8"));
            if (current.nonce !== nonce) fail("GUARD_LEASE_UNVERIFIED");
            const fd = fs.openSync(ownerFile, "r+");
            try { fs.ftruncateSync(fd); fs.writeFileSync(fd, JSON.stringify({ parentPid: process.pid, childPid, nonce })); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
          },
          release() {
            try { if (JSON.parse(fs.readFileSync(ownerFile, "utf8")).nonce === nonce) { fs.unlinkSync(ownerFile); fs.rmdirSync(file); } } catch { /* An uncertain lease remains closed. */ }
          },
        };
      } catch (error) {
        if (error.code !== "EEXIST") fail("GUARD_LEASE_UNVERIFIED");
        let prior, priorFile;
        try {
          const stat = fs.lstatSync(file); if (!stat.isDirectory() || stat.isSymbolicLink()) fail("GUARD_LEASE_UNVERIFIED");
          const owners = fs.readdirSync(file); if (owners.length !== 1 || !/^[a-f0-9-]+\.owner$/.test(owners[0])) fail("GUARD_LEASE_UNVERIFIED");
          priorFile = path.join(file, owners[0]); const ownerStat = fs.lstatSync(priorFile);
          if (!ownerStat.isFile() || ownerStat.isSymbolicLink() || ownerStat.size > 1024) fail("GUARD_LEASE_UNVERIFIED");
          prior = JSON.parse(fs.readFileSync(priorFile, "utf8"));
        } catch { fail("GUARD_LEASE_UNVERIFIED"); }
        if (!Number.isSafeInteger(prior.parentPid) || prior.parentPid < 1 || !Number.isSafeInteger(prior.childPid) || prior.childPid < 1 || typeof prior.nonce !== "string") fail("GUARD_LEASE_UNVERIFIED");
        if (pidAlive(prior.parentPid) !== false || pidAlive(prior.childPid) !== false) fail("CHILD_STILL_RUNNING");
        // Unique owner filename + nonrecursive removal prevents stale-owner
        // reclamation from deleting a newly acquired lease (ABA).
        try { fs.unlinkSync(priorFile); fs.rmdirSync(file); } catch { fail("GUARD_LEASE_UNVERIFIED"); }
      }
    }
    fail("GUARD_LEASE_UNVERIFIED");
  } };
}
