import type { AppContext } from "../../core/app-context.js";
import { ModeDockError } from "../../core/errors.js";
import { VERSION } from "../../core/version.js";
import type { InstallationRecord, InstallPlan, LanguageName, LogoStyle, TargetProfile, ThemeName } from "../../types/index.js";
import { message, type MessageKey } from "./messages.js";
import { TerminalUI, type LiveMenuAction } from "./terminal.js";

export class InteractiveApp {
  private ui: TerminalUI;

  constructor(private readonly context: AppContext) {
    this.ui = this.createUi();
  }

  async run(): Promise<void> {
    while (process.exitCode !== 130) {
      const active = await this.activeOrUndefined();
      const subtitle = active
        ? this.text("selectedTarget", { name: active.name })
        : this.text("noTargetProfiles");
      const selected = await this.ui.select(this.text("mainMenu"), [
        this.text("install"),
        this.text("manage"),
        this.text("profiles"),
        this.text("findGames"),
        this.text("backups"),
        this.text("settings"),
        this.text("help"),
        this.text("exit")
      ], { subtitle: `ModeDOCK ${VERSION}  |  ${subtitle}` });
      if (selected === null || selected === 7) return;
      try {
        if (selected === 0) await this.install();
        if (selected === 1) await this.manageInstalled();
        if (selected === 2) await this.profiles();
        if (selected === 3) await this.findGames();
        if (selected === 4) await this.backups();
        if (selected === 5) await this.settings();
        if (selected === 6) await this.help();
      } catch (error) {
        this.ui.clear();
        this.ui.header();
        this.ui.error((error as Error).message);
        await this.ui.pause();
      }
    }
  }

  private async findGames(): Promise<void> {
    const detected = await this.ui.spinner(this.text("scanning"), () => this.context.targets.detect());
    if (!detected.length) {
      this.ui.status(this.text("noDetected"));
      await this.ui.pause();
      return;
    }
    const index = await this.ui.select(this.text("detected"), detected.map(item => `${item.name}  [${item.adapterId}]\n    ${item.rootDir}`), {
      subtitle: this.text("discoverySubtitle")
    });
    if (index === null) return;
    const target = await this.context.targets.addDetected(detected[index]!);
    await this.context.targets.select(target.id);
    this.ui.status(this.text("targetCreated", { name: target.name }));
    await this.ui.pause();
  }

  private async createTarget(): Promise<void> {
    this.ui.clear();
    this.ui.header(this.text("createProfile"));
    const rootDir = await this.ui.prompt(this.text("installDir"));
    if (!rootDir) return;
    const analyzed = await this.ui.spinner(this.text("analyzingFolder"), () => this.context.targets.analyze(rootDir));
    this.ui.clear();
    this.ui.header(this.text("analysisResult"));
    this.ui.status(this.text("inferredName", { value: analyzed.name }));
    this.ui.status(this.text("inferredExecutable", { value: analyzed.executable }));
    this.ui.status(this.text("inferredLoader", { value: analyzed.loader ?? "none" }));
    this.ui.status(this.text("inferredMods", { value: analyzed.modsDir ?? "Mods" }));
    this.ui.status(this.text("inferredPlugins", { value: analyzed.pluginsDir ?? "Plugins" }));
    this.ui.status(this.text("inferredConfig", { value: analyzed.configDir ?? "Config" }));
    if (!await this.ui.confirm(this.text("createProfileConfirm"))) return;
    const target = await this.context.targets.add(analyzed);
    await this.context.targets.select(target.id);
    this.ui.status(this.text("targetCreated", { name: target.name }));
    await this.ui.pause();
  }

  private async profiles(): Promise<void> {
    while (true) {
      const targets = await this.context.targets.list();
      const activeId = this.context.config.get("defaultTarget");
      const ordered = [...targets].sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId) || a.name.localeCompare(b.name));
      const items = [
        ...ordered.map(item => `${item.id === activeId ? "*" : " "} ${item.name}  -  ${item.loader || "none"}`),
        `+ ${this.text("addFolder")}`
      ];
      const selected = await this.ui.select(this.text("profiles"), items, {
        subtitle: this.text("profilesSubtitle", { count: targets.length })
      });
      if (selected === null) return;
      if (selected === ordered.length) {
        await this.createTarget();
        continue;
      }
      await this.profileActions(ordered[selected]!);
    }
  }

  private async profileActions(target: TargetProfile): Promise<void> {
    const action = await this.ui.select(target.name, [
      this.text("useProfile"),
      this.text("refreshIntegration"),
      this.text("profileDetails"),
      this.text("removeProfile"),
      this.text("back")
    ], { subtitle: `${target.rootDir}  |  ${target.loader || "none"}` });
    if (action === null || action === 4) return;
    if (action === 0) {
      await this.context.targets.select(target.id);
      this.ui.status(this.text("selectedProfile", { name: target.name }));
      await this.ui.pause();
      return;
    }
    if (action === 1) {
      const analyzed = await this.ui.spinner(this.text("analyzingFolder"), () =>
        this.context.targets.analyze(target.rootDir, target.executable, target.name));
      const updated = await this.context.targets.edit(target.id, {
        executable: analyzed.executable,
        modsDir: analyzed.modsDir,
        pluginsDir: analyzed.pluginsDir,
        configDir: analyzed.configDir,
        loader: analyzed.loader,
        rules: analyzed.rules,
        supportedExtensions: analyzed.supportedExtensions
      });
      this.ui.status(this.text("profileRefreshed", { name: updated.name, loader: updated.loader }));
      await this.ui.pause();
      return;
    }
    if (action === 2) {
      this.ui.clear();
      this.ui.header(this.text("profileDetails"));
      this.ui.status(this.text("inferredName", { value: target.name }));
      this.ui.status(`${this.text("installDir")}: ${target.rootDir}`);
      this.ui.status(this.text("inferredExecutable", { value: target.executable }));
      this.ui.status(this.text("inferredLoader", { value: target.loader }));
      this.ui.status(this.text("inferredMods", { value: target.modsDir }));
      this.ui.status(this.text("inferredPlugins", { value: target.pluginsDir }));
      this.ui.status(this.text("inferredConfig", { value: target.configDir }));
      await this.ui.pause();
      return;
    }
    if (!await this.ui.confirm(this.text("removeProfileConfirm", { name: target.name }))) return;
    await this.context.targets.remove(target.id);
    this.ui.status(this.text("profileRemoved", { name: target.name }));
    await this.ui.pause();
  }

  private async manageInstalled(): Promise<void> {
    const target = await this.requireTarget();
    if (!target) return;
    const records = await this.context.installationStore.list(target.id);
    if (!records.length) {
      this.ui.status(this.text("noManaged"));
      await this.ui.pause();
      return;
    }
    const labels = await Promise.all(records.map(async record => {
      const health = await this.context.installer.health(target, record);
      return `${record.name}  -  ${this.text(health === "active" ? "healthActive" : health === "disabled" ? "healthDisabled" : "healthError")}`;
    }));
    const index = await this.ui.select(this.text("installedItems"), labels, { subtitle: this.text("target", { name: target.name }) });
    if (index === null) return;
    await this.manageItem(target, records[index]!);
  }

  private async manageItem(target: TargetProfile, record: InstallationRecord): Promise<void> {
    const action = await this.ui.select(record.name, [
      this.text("showMetadata"),
      record.enabled ? this.text("disable") : this.text("enable"),
      this.text("reinstall"),
      this.text("remove")
    ], { subtitle: this.text("target", { name: target.name }) });
    if (action === null) return;
    if (action === 0) {
      this.ui.clear();
      this.ui.header(this.text("target", { name: target.name }));
      this.ui.status(JSON.stringify({ ...record, status: await this.context.installer.health(target, record) }, null, 2));
      await this.ui.pause();
      return;
    }
    if (action === 1) {
      if (record.enabled) await this.context.installer.disable(target, record);
      else await this.context.installer.enable(target, record);
      this.ui.status(this.text(record.enabled ? "enabled" : "disabled", { name: record.name }));
      await this.ui.pause();
      return;
    }
    if (action === 2) {
      if (!await this.ui.confirm(this.text("reinstallConfirm", { name: record.name }))) return;
      await this.ui.spinner(this.text("reinstalling", { name: record.name }), () => this.context.installer.reinstall(target, record, { force: true }));
      this.ui.status(this.text("reinstalled", { name: record.name }));
      await this.ui.pause();
      return;
    }
    await this.removeRecord(target, record);
  }

  private async install(): Promise<void> {
    const target = await this.requireTarget();
    if (!target) return;
    this.ui.clear();
    this.ui.header(this.text("target", { name: target.name }));
    const source = await this.ui.prompt(this.text("sourcePrompt"));
    if (!source) return;
    let plan: InstallPlan;
    try {
      plan = await this.ui.spinner(this.text("planning"), () => this.context.installer.plan(source, target));
    } catch (error) {
      const details = error instanceof ModeDockError && error.code === "DUPLICATE_INSTALL"
        ? error.details as { installationId?: unknown; name?: unknown } | undefined
        : undefined;
      if (typeof details?.installationId !== "string" || typeof details.name !== "string") throw error;
      if (!await this.ui.confirm(this.text("duplicateReinstallConfirm", { name: details.name }))) return;
      const record = await this.context.installationStore.resolve(target.id, details.installationId);
      const replacement = await this.ui.spinner(this.text("reinstalling", { name: record.name }), () =>
        this.context.installer.reinstall(target, record, { force: true }));
      this.ui.status(this.text("reinstalled", { name: replacement.name }));
      await this.ui.pause();
      return;
    }
    const summary = this.text("plan", {
      files: this.text("fileUnit", { count: plan.files.length }),
      size: this.formatBytes(plan.totalBytes),
      overwrites: this.text("overwriteUnit", { count: plan.overwrites.length })
    });
    this.ui.status(`\n${summary}`);
    for (const file of plan.files.slice(0, 12)) this.ui.status(`  ${this.text(file.exists ? "replace" : "create")}  ${file.targetRelative}`);
    if (plan.files.length > 12) this.ui.status(`  ${this.text("more", { count: plan.files.length - 12 })}`);
    if (!await this.ui.confirm(this.text("installConfirm", { name: plan.name }))) return;
    const record = await this.ui.spinner(this.text("installing", { name: plan.name }), () => this.context.installer.install(plan, { force: plan.overwrites.length > 0 }));
    this.ui.status(this.text("installed", { name: record.name }));
    await this.ui.pause();
  }

  private async removeRecord(target: TargetProfile, record: InstallationRecord): Promise<void> {
    if (this.context.config.get("confirmBeforeRemove") && !await this.ui.confirm(this.text("removeConfirm", { name: record.name }))) return;
    await this.context.installer.remove(target, record);
    this.ui.status(this.text("removed", { name: record.name }));
    await this.ui.pause();
  }

  private async backups(): Promise<void> {
    const target = await this.requireTarget();
    if (!target) return;
    const action = await this.ui.select(this.text("backups"), [
      this.text("createSnapshot"),
      this.text("restoreSnapshot"),
      this.text("recover")
    ], { subtitle: this.text("target", { name: target.name }) });
    if (action === null) return;
    if (action === 0) {
      const date = new Date().toLocaleString(this.language === "ru" ? "ru-RU" : "en-US");
      const name = await this.ui.prompt(this.text("snapshotName"), this.text("snapshotDefault", { date }));
      const snapshot = await this.context.backups.create(target, name);
      this.ui.status(this.text("snapshotCreated", { name: snapshot.name }));
      await this.ui.pause();
      return;
    }
    if (action === 1) {
      const snapshots = await this.context.backups.list(target.id);
      if (!snapshots.length) {
        this.ui.status(this.text("noSnapshots"));
        await this.ui.pause();
        return;
      }
      const index = await this.ui.select(this.text("restoreSnapshot"), snapshots.map(item => `${item.name}  [${this.text("snapshotFiles", { count: item.files.length })}]`));
      if (index === null || !await this.ui.confirm(this.text("restoreConfirm", { name: snapshots[index]!.name }))) return;
      await this.context.backups.restore(target, snapshots[index]!, { force: true });
      this.ui.status(this.text("snapshotRestored"));
      await this.ui.pause();
      return;
    }
    const recovered = await this.context.installer.recoverInterrupted();
    this.ui.status(recovered.length ? this.text("recovered", { count: recovered.length }) : this.text("noInterrupted"));
    await this.ui.pause();
  }

  private async settings(): Promise<void> {
    while (true) {
      const selected = await this.ui.liveMenu(
        () => this.text("settings"),
        () => this.settingsItems(),
        (index, action) => this.changeSetting(index, action),
        { subtitle: () => this.text("settingsSubtitle") }
      );
      if (selected === null || selected === 6) return;
      if (selected === 5) {
        this.ui.clear();
        this.ui.header(this.text("settings"));
        this.ui.status(JSON.stringify({
          data: this.context.paths.root,
          config: this.context.config.file,
          backups: this.context.paths.backups,
          logs: this.context.paths.logs
        }, null, 2));
        await this.ui.pause();
      }
    }
  }

  private settingsItems(): string[] {
    const config = this.context.config.getAll();
    return [
      this.text("language", { value: this.text(config.language === "ru" ? "russian" : "english") }),
      this.text("color", { value: this.themeName(config.theme) }),
      this.text("logo", { value: this.text(config.logoStyle) }),
      this.text("automaticBackups", { value: this.switchName(config.createBackups) }),
      this.text("removeConfirmation", { value: this.switchName(config.confirmBeforeRemove) }),
      this.text("showPaths"),
      this.text("back")
    ];
  }

  private async changeSetting(index: number, action: LiveMenuAction): Promise<boolean> {
    if (index >= 5) return action !== "activate";
    const config = this.context.config.getAll();
    const direction = action === "previous" ? -1 : 1;
    if (index === 0) {
      const values: LanguageName[] = ["en", "ru"];
      await this.context.config.set("language", this.cycle(values, config.language, direction));
    }
    if (index === 1) {
      const values: ThemeName[] = ["default", "mono", "amber"];
      await this.context.config.set("theme", this.cycle(values, config.theme, direction));
    }
    if (index === 2) {
      const values: LogoStyle[] = ["full", "compact"];
      await this.context.config.set("logoStyle", this.cycle(values, config.logoStyle, direction));
    }
    if (index === 3) await this.context.config.set("createBackups", !config.createBackups);
    if (index === 4) await this.context.config.set("confirmBeforeRemove", !config.confirmBeforeRemove);
    this.syncUi();
    return true;
  }

  private async help(): Promise<void> {
    this.ui.clear();
    this.ui.header(`ModeDOCK ${VERSION}`);
    this.ui.status(this.text("interactiveHelp"));
    await this.ui.pause();
  }

  private createUi(): TerminalUI {
    return new TerminalUI(this.context.config.get("theme"), this.context.config.get("logoStyle"), this.context.config.get("language"));
  }

  private syncUi(): void {
    this.ui.configure(this.context.config.get("theme"), this.context.config.get("logoStyle"), this.context.config.get("language"));
  }

  private get language(): LanguageName { return this.context.config.get("language"); }
  private text(key: MessageKey, values: Record<string, string | number> = {}): string { return message(this.language, key, values); }
  private switchName(value: boolean): string { return this.text(value ? "on" : "off"); }
  private themeName(value: ThemeName): string { return this.text(value === "default" ? "cyan" : value === "mono" ? "monochrome" : "amber"); }
  private cycle<T>(values: T[], current: T, direction: number): T {
    const index = values.indexOf(current);
    return values[(index + direction + values.length) % values.length]!;
  }

  private formatBytes(value: number): string {
    if (value < 1024) return `${value} B`;
    const units = ["KiB", "MiB", "GiB"];
    let amount = value / 1024;
    let unit = units[0]!;
    for (let index = 1; amount >= 1024 && index < units.length; index++) {
      amount /= 1024;
      unit = units[index]!;
    }
    return `${new Intl.NumberFormat(this.language === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 1 }).format(amount)} ${unit}`;
  }

  private async activeOrUndefined(): Promise<TargetProfile | undefined> {
    try { return await this.context.targets.active(); }
    catch { return undefined; }
  }

  private async requireTarget(): Promise<TargetProfile | undefined> {
    const target = await this.activeOrUndefined();
    if (target) return target;
    await this.profiles();
    return this.activeOrUndefined();
  }
}
