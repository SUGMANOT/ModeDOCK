import type { ProfileLockfile, SyncPlan, VerificationReport } from "../types.js";

export class Output {
  constructor(private readonly json: boolean) {}

  value(value: unknown, human: string): void {
    process.stdout.write(this.json ? `${JSON.stringify(value, null, 2)}\n` : `${human}\n`);
  }

  plan(plan: SyncPlan): void {
    if (this.json) return this.value(plan, "");
    const lines = [
      `Plan ${plan.id}`,
      `Packages: +${plan.summary.packagesAdded.length} ~${plan.summary.packagesUpdated.length} -${plan.summary.packagesRemoved.length}`,
      `Files: write ${plan.summary.filesWritten}, remove ${plan.summary.filesRemoved}, restore ${plan.summary.filesRestored}`,
      `Download: ${formatBytes(plan.summary.downloadBytes)}`
    ];
    for (const operation of plan.operations) lines.push(`  ${operation.action.padEnd(16)} ${operation.targetRelative}`);
    this.value(plan, lines.join("\n"));
  }

  lock(lock: ProfileLockfile): void {
    if (this.json) return this.value(lock, "");
    const packages = lock.resolutionOrder.map(id => `${id}@${lock.packages[id]!.version}`);
    this.value(lock, packages.length ? `Synchronized ${lock.profileId}:\n${packages.map(item => `  ${item}`).join("\n")}` : `Profile '${lock.profileId}' is now clean.`);
  }

  verification(report: VerificationReport): void {
    if (this.json) return this.value(report, "");
    if (report.ok) return this.value(report, `Verified ${report.checkedFiles} managed file(s): OK`);
    this.value(report, [`Verification failed (${report.issues.length} issue(s))`, ...report.issues.map(issue => `  ${issue.code.padEnd(16)} ${issue.path}: ${issue.message}`)].join("\n"));
  }
}

function formatBytes(value: number): string {
  const units = ["B", "KiB", "MiB", "GiB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index++; }
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
