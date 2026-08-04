import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import type { ModeDockConfig, TargetProfile } from "../../types/index.js";
import type { DataPaths } from "../../services/filesystem/paths.js";
import type { TargetService } from "../targets/target-service.js";
import type { InstallationStore } from "../stores/installation-store.js";
import type { InstallerService } from "../installer/installer-service.js";
import { assertWritable } from "../../services/filesystem/safe-fs.js";

export interface DiagnosticCheck {
  name: string;
  status: "ok" | "warning" | "error";
  message: string;
}

export class DoctorService {
  constructor(
    private readonly paths: DataPaths,
    private readonly config: () => ModeDockConfig,
    private readonly targets: TargetService,
    private readonly installations: InstallationStore,
    private readonly installer: InstallerService,
    private readonly adapterErrors: string[]
  ) {}

  async run(selector?: string): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];
    const major = Number(process.versions.node.split(".")[0]);
    checks.push({ name: "node", status: major >= 20 ? "ok" : "error", message: `Node.js ${process.versions.node} (required: >=20)` });
    checks.push({ name: "operating-system", status: ["win32", "linux", "darwin"].includes(process.platform) ? "ok" : "warning", message: `${process.platform}-${process.arch}` });
    try { await assertWritable(this.paths.root); checks.push({ name: "data-directory", status: "ok", message: this.paths.root }); }
    catch (error) { checks.push({ name: "data-directory", status: "error", message: (error as Error).message }); }
    checks.push(...validateConfig(this.config()));
    for (const error of this.adapterErrors) checks.push({ name: "custom-adapter", status: "error", message: error });
    const validations = await this.targets.validate(selector).catch(error => {
      checks.push({ name: "target-state", status: "error", message: (error as Error).message });
      return [];
    });
    for (const validation of validations) {
      const target = validation.target;
      checks.push({ name: `target:${target.name}`, status: validation.issues.length ? "error" : "ok", message: validation.issues.join("; ") || target.rootDir });
      try {
        await access(target.rootDir, constants.W_OK);
        checks.push({ name: `permissions:${target.name}`, status: "ok", message: "Target root is writable." });
      } catch { checks.push({ name: `permissions:${target.name}`, status: "error", message: "Target root is not writable." }); }
      checks.push(...await this.checkInstallations(target));
    }
    const interrupted = await this.installer.interrupted();
    checks.push({
      name: "transactions",
      status: interrupted.length ? "error" : "ok",
      message: interrupted.length ? `${interrupted.length} interrupted operation(s); run 'moddock backup recover'.` : "No interrupted operations."
    });
    return checks;
  }

  private async checkInstallations(target: TargetProfile): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];
    const corrupt = await this.installations.corruptFiles(target.id);
    for (const file of corrupt) checks.push({ name: "corrupt-state", status: "error", message: file });
    for (const record of await this.installations.list(target.id)) {
      const health = await this.installer.health(target, record);
      checks.push({ name: `item:${record.name}`, status: health === "error" ? "error" : "ok", message: health });
      const extension = path.extname(record.sourceName).toLowerCase();
      const supportedExtensions = target.supportedExtensions.map(value => value.toLowerCase());
      const scriptVariant = [".mjs", ".cjs"].includes(extension) && supportedExtensions.includes(".js");
      if (extension && record.sourceType === "file" && !supportedExtensions.includes(extension) && !scriptVariant)
        checks.push({ name: `format:${record.name}`, status: "warning", message: `${extension} is not in the target's supported extension list.` });
    }
    return checks;
  }
}

function validateConfig(config: ModeDockConfig): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  if (config.maxArchiveFiles < 1 || config.maxArchiveFiles > 1_000_000)
    checks.push({ name: "config:maxArchiveFiles", status: "error", message: "Must be between 1 and 1,000,000." });
  if (config.maxArchiveBytes < 1)
    checks.push({ name: "config:maxArchiveBytes", status: "error", message: "Must be positive." });
  if (!checks.length) checks.push({ name: "configuration", status: "ok", message: "Configuration is valid." });
  return checks;
}
