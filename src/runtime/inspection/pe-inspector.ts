import { readFile } from "node:fs/promises";
import path from "node:path";
import { ModeDockError } from "../../core/errors.js";
import { expandPath, sha256Bytes } from "../../services/filesystem/safe-fs.js";

export type PeFormat = "PE32" | "PE32+";
export type PeArchitecture = "x86" | "x64" | "ARM64" | "unknown";

export interface DllInspectionReport {
  path: string;
  fileName: string;
  size: number;
  kind: "native" | "managed";
  format: PeFormat;
  architecture: PeArchitecture;
  managed: boolean;
  hasClrHeader: boolean;
  sha256: string;
  imports: string[];
  exports: string[];
  detectedRuntime: "modedock-native-abi-v1" | "managed-clr" | "native-unknown";
  nativeAbi: {
    level: "N1" | "none";
    requiredExportsPresent: boolean;
    optionalExports: string[];
  };
  assembly?: {
    name?: string;
    version?: string;
    references: string[];
  };
  signals: {
    bepinExReferences: boolean;
    harmonyReferences: boolean;
    unityEngineReferences: boolean;
    assemblyCSharpReferences: boolean;
  };
  bepInExCompatible: false;
  harmonyReferences: boolean;
  authenticode: {
    status: "not-signed" | "present-unverified";
    size: number;
  };
  warnings: string[];
}

interface Section {
  virtualAddress: number;
  virtualSize: number;
  rawOffset: number;
  rawSize: number;
}

interface DataDirectory { address: number; size: number; }

const REQUIRED_ABI_V1_EXPORTS = [
  "ModeDOCK_GetApiVersion",
  "ModeDOCK_GetDescription",
  "ModeDOCK_GetName",
  "ModeDOCK_TestPing"
] as const;

const OPTIONAL_ABI_EXPORTS = ["ModeDOCK_Load", "ModeDOCK_Unload", "ModeDOCK_GetCapabilities"] as const;

export async function inspectDll(input: string): Promise<DllInspectionReport> {
  const file = expandPath(input);
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await readFile(file)); }
  catch (error) {
    throw new ModeDockError(`DLL does not exist or cannot be read: ${file}`, "DLL_NOT_READABLE", { path: file, cause: (error as Error).message });
  }
  return inspectPortableExecutable(bytes, file);
}

export function inspectPortableExecutable(bytes: Uint8Array, file = "<memory>"): DllInspectionReport {
  const reader = new PeReader(bytes, file);
  const parsed = reader.parse();
  const exports = parseExports(reader, parsed.directories[0], parsed.sections);
  const imports = parseImports(reader, parsed.directories[1], parsed.sections);
  const clr = parsed.directories[14] ?? { address: 0, size: 0 };
  const managed = clr.address !== 0 && clr.size !== 0;
  const requiredExportsPresent = REQUIRED_ABI_V1_EXPORTS.every(name => exports.includes(name));
  const optionalExports = OPTIONAL_ABI_EXPORTS.filter(name => exports.includes(name));
  const referenceSignals = scanReferenceSignals(bytes);
  const architecture = architectureName(parsed.machine);
  const expectedArchitecture = processArchitecture();
  const warnings: string[] = [];
  if (architecture === "unknown") warnings.push(`Unsupported PE machine type 0x${parsed.machine.toString(16).padStart(4, "0")}.`);
  else if (expectedArchitecture && architecture !== expectedArchitecture)
    warnings.push(`Architecture mismatch: DLL is ${architecture}, current ModeDOCK process is ${expectedArchitecture}.`);
  if (managed) warnings.push("This static PE report is B0 metadata only; B2 execution is limited to the separate controlled managed harness.");

  const certificate = parsed.directories[4] ?? { address: 0, size: 0 };
  return {
    path: file === "<memory>" ? file : path.resolve(file),
    fileName: file === "<memory>" ? file : path.basename(file),
    size: bytes.byteLength,
    kind: managed ? "managed" : "native",
    format: parsed.format,
    architecture,
    managed,
    hasClrHeader: managed,
    sha256: sha256Bytes(bytes),
    imports,
    exports,
    detectedRuntime: requiredExportsPresent ? "modedock-native-abi-v1" : managed ? "managed-clr" : "native-unknown",
    nativeAbi: {
      level: requiredExportsPresent ? "N1" : "none",
      requiredExportsPresent,
      optionalExports
    },
    ...(managed ? { assembly: { references: referenceSignals.references } } : {}),
    signals: {
      bepinExReferences: referenceSignals.bepinEx,
      harmonyReferences: referenceSignals.harmony,
      unityEngineReferences: referenceSignals.unityEngine,
      assemblyCSharpReferences: referenceSignals.assemblyCSharp
    },
    bepInExCompatible: false,
    harmonyReferences: referenceSignals.harmony,
    authenticode: {
      status: certificate.address && certificate.size ? "present-unverified" : "not-signed",
      size: certificate.size
    },
    warnings
  };
}

class PeReader {
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array, private readonly file: string) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  parse(): { machine: number; format: PeFormat; directories: DataDirectory[]; sections: Section[] } {
    if (this.bytes.byteLength < 64 || this.u16(0) !== 0x5a4d) this.invalid("Missing DOS MZ signature.");
    const peOffset = this.u32(0x3c);
    if (peOffset < 64 || peOffset + 24 > this.bytes.byteLength || this.u32(peOffset) !== 0x00004550)
      this.invalid("Missing or invalid PE signature.");
    const coff = peOffset + 4;
    const machine = this.u16(coff);
    const sectionCount = this.u16(coff + 2);
    const optionalSize = this.u16(coff + 16);
    if (sectionCount < 1 || sectionCount > 96) this.invalid(`Invalid section count: ${sectionCount}.`);
    const optional = coff + 20;
    this.ensure(optional, optionalSize);
    const magic = this.u16(optional);
    const format: PeFormat = magic === 0x10b ? "PE32" : magic === 0x20b ? "PE32+" : this.invalid(`Unsupported optional-header magic 0x${magic.toString(16)}.`);
    const directoryCountOffset = optional + (format === "PE32+" ? 108 : 92);
    const directoriesOffset = optional + (format === "PE32+" ? 112 : 96);
    const directoryCount = Math.min(this.u32(directoryCountOffset), 32);
    const directories: DataDirectory[] = [];
    for (let index = 0; index < directoryCount; index++) {
      const offset = directoriesOffset + index * 8;
      if (offset + 8 > optional + optionalSize) break;
      directories.push({ address: this.u32(offset), size: this.u32(offset + 4) });
    }

    const sectionTable = optional + optionalSize;
    this.ensure(sectionTable, sectionCount * 40);
    const sections: Section[] = [];
    for (let index = 0; index < sectionCount; index++) {
      const offset = sectionTable + index * 40;
      sections.push({
        virtualSize: this.u32(offset + 8),
        virtualAddress: this.u32(offset + 12),
        rawSize: this.u32(offset + 16),
        rawOffset: this.u32(offset + 20)
      });
    }
    return { machine, format, directories, sections };
  }

  u16(offset: number): number { this.ensure(offset, 2); return this.view.getUint16(offset, true); }
  u32(offset: number): number { this.ensure(offset, 4); return this.view.getUint32(offset, true); }

  asciiZ(offset: number, maxLength = 4096): string {
    this.ensure(offset, 1);
    const endLimit = Math.min(this.bytes.byteLength, offset + maxLength);
    let end = offset;
    while (end < endLimit && this.bytes[end] !== 0) end++;
    if (end === endLimit) this.invalid(`Unterminated PE string at file offset 0x${offset.toString(16)}.`);
    return new TextDecoder("ascii", { fatal: false }).decode(this.bytes.subarray(offset, end));
  }

  rvaToOffset(rva: number, sections: Section[]): number {
    for (const section of sections) {
      const span = Math.max(section.virtualSize, section.rawSize);
      if (rva >= section.virtualAddress && rva < section.virtualAddress + span) {
        const relative = rva - section.virtualAddress;
        if (relative >= section.rawSize) this.invalid(`RVA 0x${rva.toString(16)} points outside section raw data.`);
        const offset = section.rawOffset + relative;
        this.ensure(offset, 1);
        return offset;
      }
    }
    if (rva < this.bytes.byteLength) return rva;
    return this.invalid(`RVA 0x${rva.toString(16)} is not mapped by any PE section.`);
  }

  ensure(offset: number, length: number): void {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > this.bytes.byteLength)
      this.invalid(`PE structure exceeds file bounds at 0x${Math.max(0, offset).toString(16)}.`);
  }

  invalid(message: string): never {
    throw new ModeDockError(`Cannot inspect '${this.file}': ${message}`, "INVALID_PE", { path: this.file });
  }
}

function parseExports(reader: PeReader, directory: DataDirectory | undefined, sections: Section[]): string[] {
  if (!directory?.address || !directory.size) return [];
  const table = reader.rvaToOffset(directory.address, sections);
  const count = reader.u32(table + 24);
  const namesRva = reader.u32(table + 32);
  if (count > 65_536) throw new ModeDockError(`PE export count is unreasonable: ${count}.`, "INVALID_PE");
  if (!count || !namesRva) return [];
  const namesOffset = reader.rvaToOffset(namesRva, sections);
  const exports: string[] = [];
  for (let index = 0; index < count; index++) {
    const nameRva = reader.u32(namesOffset + index * 4);
    if (nameRva) exports.push(reader.asciiZ(reader.rvaToOffset(nameRva, sections)));
  }
  return [...new Set(exports)].sort((a, b) => a.localeCompare(b));
}

function parseImports(reader: PeReader, directory: DataDirectory | undefined, sections: Section[]): string[] {
  if (!directory?.address || !directory.size) return [];
  const table = reader.rvaToOffset(directory.address, sections);
  const imports: string[] = [];
  const maxDescriptors = Math.min(4096, Math.ceil(directory.size / 20) + 1);
  for (let index = 0; index < maxDescriptors; index++) {
    const descriptor = table + index * 20;
    const originalThunk = reader.u32(descriptor);
    const timeDateStamp = reader.u32(descriptor + 4);
    const forwarderChain = reader.u32(descriptor + 8);
    const nameRva = reader.u32(descriptor + 12);
    const firstThunk = reader.u32(descriptor + 16);
    if (!(originalThunk || timeDateStamp || forwarderChain || nameRva || firstThunk)) break;
    if (nameRva) imports.push(reader.asciiZ(reader.rvaToOffset(nameRva, sections)));
  }
  return [...new Set(imports)].sort((a, b) => a.localeCompare(b));
}

function architectureName(machine: number): PeArchitecture {
  if (machine === 0x014c) return "x86";
  if (machine === 0x8664) return "x64";
  if (machine === 0xaa64) return "ARM64";
  return "unknown";
}

function processArchitecture(): Exclude<PeArchitecture, "unknown"> | undefined {
  if (process.arch === "ia32") return "x86";
  if (process.arch === "x64") return "x64";
  if (process.arch === "arm64") return "ARM64";
  return undefined;
}

function scanReferenceSignals(bytes: Uint8Array): {
  references: string[];
  bepinEx: boolean;
  harmony: boolean;
  unityEngine: boolean;
  assemblyCSharp: boolean;
} {
  const ascii = new TextDecoder("latin1").decode(bytes);
  const utf16 = new TextDecoder("utf-16le").decode(bytes);
  const contains = (pattern: RegExp) => pattern.test(ascii) || pattern.test(utf16);
  const known = ["BepInEx", "BepInEx.Unity.Mono", "0Harmony", "HarmonyX", "UnityEngine", "Assembly-CSharp"];
  const references = known.filter(name => ascii.includes(name) || utf16.includes(name));
  return {
    references,
    bepinEx: contains(/BepInEx(?:\.Unity\.Mono)?/i),
    harmony: contains(/(?:0Harmony|HarmonyX|HarmonyLib)/i),
    unityEngine: contains(/UnityEngine/i),
    assemblyCSharp: contains(/Assembly-CSharp/i)
  };
}
