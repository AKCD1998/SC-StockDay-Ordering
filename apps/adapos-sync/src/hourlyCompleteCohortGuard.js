import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHourlyGuard } from "./hourlyGuardProcess.js";

export const assertHourlyCompleteCohortGuard = createHourlyGuard({
  executable: path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
  script: fileURLToPath(new URL("./hourlyCompleteCohortGuard.ps1", import.meta.url)),
});
