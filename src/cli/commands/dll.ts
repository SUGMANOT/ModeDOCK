import { inspectDll } from "../../runtime/inspection/pe-inspector.js";
import { ModeDockError, UsageError } from "../../core/errors.js";
import { CliOutput } from "../output.js";
import type { CommandEnvironment } from "./shared.js";
import { requiredPosition } from "./shared.js";
import { confirmOrThrow } from "./shared.js";
import { NativeProbeClient } from "../../runtime/probe/native-probe-client.js";
import { ManagedInspectorClient } from "../../runtime/inspection/managed-inspector-client.js";
import { generateRuntimeManifest } from "../../runtime/manifest/runtime-manifest.js";

export async function dllCommand(environment: CommandEnvironment, positionals: string[]): Promise<void> {
  const action = positionals[1];
  if (!action || !["inspect", "probe", "manifest"].includes(action)) throw new UsageError(`Unknown dll action: ${action ?? "<missing>"}. Run 'moddock help dll'.`);
  environment.args.ensureOnly("execute-probe");
  const dllPath = requiredPosition(positionals, 2, "DLL path");
  if (action === "manifest") { const manifest = await generateRuntimeManifest(dllPath); new CliOutput(environment.json, environment.quiet).value(manifest, JSON.stringify(manifest, null, 2)); return; }
  const report = await inspectDll(dllPath);
  const output = new CliOutput(environment.json, environment.quiet);
  if (action === "probe") {
    if (!environment.args.has("execute-probe")) {
      output.value({ inspection: report, probe: { status: "not-executed", executed: false } }, "Static inspection completed. Re-run with --execute-probe to use the isolated helper.");
      return;
    }
    if (report.detectedRuntime !== "modedock-native-abi-v1")
      throw new UsageError("Dynamic probe requires the complete ModeDOCK Native ABI v1 export surface.");
    if (report.warnings.some(warning => warning.startsWith("Architecture mismatch:")))
      throw new ModeDockError("The native plugin architecture does not match the ModeDOCK probe architecture.", "ARCHITECTURE_MISMATCH", { architecture: report.architecture });
    await confirmOrThrow(environment, `Execute the isolated Native ABI self-test for '${report.fileName}'?`);
    const probe = await new NativeProbeClient().probe(report.path);
    output.value(probe, `${probe.name}: ABI ${probe.apiVersion}, ping ${probe.ping}, status ${probe.status}`);
    return;
  }
  if (environment.json) {
    if (report.managed) {
      const managedInspection = await new ManagedInspectorClient().inspect(report.path);
      output.value({ ...report, assembly: managedInspection.assembly, managedInspection });
    } else output.value(report);
    return;
  }
  output.value(report, [
    `${report.fileName}: ${report.format} ${report.architecture}, ${report.kind}`,
    `SHA-256: ${report.sha256}`,
    `Runtime: ${report.detectedRuntime}`,
    `Imports: ${report.imports.length ? report.imports.join(", ") : "none"}`,
    `Exports: ${report.exports.length ? report.exports.join(", ") : "none"}`,
    `Authenticode: ${report.authenticode.status}`,
    ...report.warnings.map(warning => `Warning: ${warning}`)
  ].join("\n"));
}
