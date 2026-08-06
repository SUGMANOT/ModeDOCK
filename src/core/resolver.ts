import type {
  GameEnvironment,
  PackageDependencyMap,
  ResolutionDiagnostic,
  ResolutionResult,
  ResolvedPackage
} from "../types.js";
import { ResolutionError } from "../errors.js";
import { compareVersions, satisfies } from "../semver.js";
import { RegistrySet } from "../registry/static-registry.js";

interface Constraint {
  range: string;
  source: string;
}

export class DependencyResolver {
  constructor(private readonly registries: RegistrySet, private readonly environment: GameEnvironment) {}

  async resolve(requirements: PackageDependencyMap): Promise<ResolutionResult> {
    const constraints = new Map<string, Constraint[]>();
    for (const [packageId, range] of Object.entries(requirements)) addConstraint(constraints, packageId, range, "profile");
    const selected = new Map<string, ResolvedPackage>();
    const diagnostics: ResolutionDiagnostic[] = [];
    const solved = await this.search(constraints, selected, diagnostics);
    if (!solved) {
      throw new ResolutionError("No compatible package resolution exists.", {
        requirements,
        diagnostics: diagnostics.slice(-20)
      });
    }
    const order = topologicalOrder(selected);
    return { packages: selected, order, diagnostics };
  }

  private async search(
    constraints: Map<string, Constraint[]>,
    selected: Map<string, ResolvedPackage>,
    diagnostics: ResolutionDiagnostic[]
  ): Promise<boolean> {
    for (const [packageId, candidate] of selected) {
      const ranges = constraints.get(packageId) ?? [];
      if (!ranges.every(item => satisfies(candidate.descriptor.manifest.version, item.range))) return false;
      if (!this.compatible(candidate)) return false;
    }

    const unresolved = [...constraints.keys()].filter(packageId => !selected.has(packageId));
    if (!unresolved.length) return noConflicts(selected);

    const candidateSets = await Promise.all(unresolved.map(async packageId => ({
      packageId,
      candidates: await this.candidates(packageId, constraints.get(packageId) ?? [], diagnostics)
    })));
    candidateSets.sort((left, right) => left.candidates.length - right.candidates.length || left.packageId.localeCompare(right.packageId));
    const choice = candidateSets[0]!;
    if (!choice.candidates.length) return false;

    for (const candidate of choice.candidates) {
      const nextConstraints = cloneConstraints(constraints);
      const nextSelected = new Map(selected);
      nextSelected.set(choice.packageId, candidate);
      for (const [dependencyId, range] of Object.entries(candidate.descriptor.manifest.dependencies ?? {})) {
        addConstraint(nextConstraints, dependencyId, range, `${choice.packageId}@${candidate.descriptor.manifest.version}`);
      }
      if (!noConflicts(nextSelected)) continue;
      if (await this.search(nextConstraints, nextSelected, diagnostics)) {
        selected.clear();
        for (const [packageId, resolved] of nextSelected) selected.set(packageId, resolved);
        constraints.clear();
        for (const [packageId, values] of nextConstraints) constraints.set(packageId, values);
        return true;
      }
    }
    return false;
  }

  private async candidates(packageId: string, constraints: Constraint[], diagnostics: ResolutionDiagnostic[]): Promise<ResolvedPackage[]> {
    const available = await this.registries.versions(packageId);
    const result: ResolvedPackage[] = [];
    for (const item of available) {
      if (!constraints.every(constraint => satisfies(item.version, constraint.range))) continue;
      try {
        const candidate = await item.registry.get(packageId, item.version);
        if (!this.compatible(candidate)) {
          diagnostics.push({ packageId, message: `${packageId}@${item.version} is incompatible with the active game environment.` });
          continue;
        }
        result.push(candidate);
      } catch (error) {
        diagnostics.push({ packageId, message: `${packageId}@${item.version}: ${(error as Error).message}` });
      }
    }
    return result.sort((left, right) => compareVersions(right.descriptor.manifest.version, left.descriptor.manifest.version));
  }

  private compatible(candidate: ResolvedPackage): boolean {
    const manifest = candidate.descriptor.manifest;
    if (manifest.game.id !== this.environment.id) return false;
    if (manifest.game.version && (!this.environment.version || !satisfies(this.environment.version, manifest.game.version))) return false;
    if (manifest.loader) {
      if (!this.environment.loader || manifest.loader.id !== this.environment.loader.id) return false;
      if (manifest.loader.version && (!this.environment.loader.version || !satisfies(this.environment.loader.version, manifest.loader.version))) return false;
    }
    if (manifest.platforms && !manifest.platforms.includes(this.environment.platform)) return false;
    if (manifest.architectures && !manifest.architectures.includes(this.environment.architecture)) return false;
    return true;
  }
}

function addConstraint(map: Map<string, Constraint[]>, packageId: string, range: string, source: string): void {
  const values = map.get(packageId) ?? [];
  values.push({ range, source });
  map.set(packageId, values);
}

function cloneConstraints(source: Map<string, Constraint[]>): Map<string, Constraint[]> {
  return new Map([...source].map(([key, values]) => [key, values.map(value => ({ ...value }))]));
}

function noConflicts(selected: Map<string, ResolvedPackage>): boolean {
  for (const [packageId, candidate] of selected) {
    for (const [conflictId, range] of Object.entries(candidate.descriptor.manifest.conflicts ?? {})) {
      const conflicting = selected.get(conflictId);
      if (conflicting && satisfies(conflicting.descriptor.manifest.version, range)) return false;
    }
    for (const [otherId, other] of selected) {
      if (otherId === packageId) continue;
      const range = other.descriptor.manifest.conflicts?.[packageId];
      if (range && satisfies(candidate.descriptor.manifest.version, range)) return false;
    }
  }
  return true;
}

function topologicalOrder(selected: Map<string, ResolvedPackage>): string[] {
  const temporary = new Set<string>();
  const permanent = new Set<string>();
  const order: string[] = [];
  const visit = (packageId: string): void => {
    if (permanent.has(packageId)) return;
    if (temporary.has(packageId)) throw new ResolutionError(`Dependency cycle includes '${packageId}'.`, { packageId });
    temporary.add(packageId);
    const dependencies = Object.keys(selected.get(packageId)?.descriptor.manifest.dependencies ?? {}).sort();
    for (const dependency of dependencies) if (selected.has(dependency)) visit(dependency);
    temporary.delete(packageId);
    permanent.add(packageId);
    order.push(packageId);
  };
  for (const packageId of [...selected.keys()].sort()) visit(packageId);
  return order;
}
