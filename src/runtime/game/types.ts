import type { InstallPlan, TargetProfile } from "../../types/index.js";

export type RuntimeKind = "modedock-native-abi-v1" | "bepinex5-compat";
export type ProtectionStatus = "none-known" | "known-protection-detected" | "unknown" | "not-applicable";

export interface GameInstallation { rootDir: string; executable: string; target: TargetProfile }
export interface GameInspection {
  supported: boolean;
  reasons: string[];
  executable: string;
  executableSha256?: string;
  architecture: "x86" | "x64" | "arm64" | "unknown";
  engine: string;
  runtime: string;
  gameVersion: string;
  unityVersion: string;
  managedPath: string;
  assemblyCSharpPath: string;
  knownProtectionStatus: ProtectionStatus;
  adapterVersion: string;
}
export interface LaunchInput { installation: GameInstallation; inspection: GameInspection; runtime: RuntimeKind; profile: string; pluginFiles: string[]; runtimePlanFile: string }
export interface LaunchPlan extends LaunchInput { adapterId: string; executablePath: string; bootstrapRoot: string }
export interface ValidationResult { valid: boolean; errors: string[]; warnings: string[] }
export interface LaunchResult { exitCode: number; signal: NodeJS.Signals | null; stdout: string; stderr: string }

export interface GameAdapter {
  readonly id: string;
  readonly version: string;
  detectInstallations(): Promise<GameInstallation[]>;
  inspect(installation: GameInstallation): Promise<GameInspection>;
  supportsRuntime(runtime: RuntimeKind): boolean;
  createLaunchPlan(input: LaunchInput): Promise<LaunchPlan>;
  validateLaunch(plan: LaunchPlan): Promise<ValidationResult>;
  installBootstrap(plan: LaunchPlan): Promise<InstallPlan>;
  uninstallBootstrap(plan: LaunchPlan): Promise<InstallPlan>;
  launch(plan: LaunchPlan): Promise<LaunchResult>;
}
