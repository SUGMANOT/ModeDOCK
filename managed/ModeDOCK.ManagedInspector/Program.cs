using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Text.Json;

namespace ModeDOCK.ManagedInspector;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public static int Main(string[] args)
    {
        if (args.Length < 2 || !string.Equals(args[0], "inspect", StringComparison.OrdinalIgnoreCase))
            return WriteError("usage-error", "Usage: ModeDOCK.ManagedInspector.exe inspect <dll> --json", 2);
        try
        {
            var report = ManagedAssemblyInspector.Inspect(Path.GetFullPath(args[1]));
            Console.Out.WriteLine(JsonSerializer.Serialize(report, JsonOptions));
            return 0;
        }
        catch (BadImageFormatException error) { return WriteError("invalid-managed-assembly", error.Message, 3); }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return WriteError("managed-inspection-failed", error.Message, 1);
        }
    }

    private static int WriteError(string code, string message, int exitCode)
    {
        Console.Out.WriteLine(JsonSerializer.Serialize(new { error = new { code, message } }, JsonOptions));
        return exitCode;
    }
}

internal static class ManagedAssemblyInspector
{
    public static ManagedInspectionReport Inspect(string file)
    {
        using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read);
        using var pe = new PEReader(stream, PEStreamOptions.LeaveOpen);
        if (!pe.HasMetadata) throw new BadImageFormatException("The PE file does not contain CLR metadata.");
        var reader = pe.GetMetadataReader();
        if (!reader.IsAssembly) throw new BadImageFormatException("The CLR module is not an assembly.");

        var definition = reader.GetAssemblyDefinition();
        var references = reader.AssemblyReferences
            .Select(handle => reader.GetAssemblyReference(handle))
            .Select(reference => new AssemblyReferenceReport(reader.GetString(reference.Name), reference.Version.ToString()))
            .OrderBy(reference => reference.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var typeReports = new List<ManagedTypeReport>();
        var plugins = new List<ManagedPluginReport>();
        var unsupported = new SortedSet<string>(StringComparer.Ordinal);
        var harmonyAttributes = new SortedSet<string>(StringComparer.Ordinal);

        foreach (var handle in reader.TypeDefinitions)
        {
            var type = reader.GetTypeDefinition(handle);
            var typeName = FullTypeName(reader, handle);
            if (typeName == "<Module>") continue;
            var baseType = FullTypeName(reader, type.BaseType);
            var attributes = ReadAttributes(reader, type.GetCustomAttributes()).ToArray();
            var methodAttributes = type.GetMethods()
                .SelectMany(methodHandle => ReadAttributes(reader, reader.GetMethodDefinition(methodHandle).GetCustomAttributes()))
                .ToArray();
            foreach (var attribute in attributes.Concat(methodAttributes).Where(item => item.TypeName.StartsWith("HarmonyLib.", StringComparison.Ordinal)))
            {
                harmonyAttributes.Add(attribute.TypeName);
                if (attribute.TypeName.EndsWith("HarmonyTranspiler", StringComparison.Ordinal))
                    unsupported.Add("HarmonyLib.HarmonyTranspiler (controlled H4 only; plugin load plans reject)");
            }

            typeReports.Add(new ManagedTypeReport(typeName, baseType, attributes.Select(attribute => attribute.TypeName).ToArray()));
            var pluginAttribute = attributes.FirstOrDefault(attribute => attribute.TypeName == "BepInEx.BepInPlugin");
            if (pluginAttribute is null) continue;
            var processes = attributes.Where(attribute => attribute.TypeName == "BepInEx.BepInProcess")
                .SelectMany(attribute => attribute.Strings.Take(1)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            var dependencies = attributes.Where(attribute => attribute.TypeName == "BepInEx.BepInDependency")
                .Select(attribute => new PluginDependencyReport(attribute.Strings.FirstOrDefault() ?? "", attribute.NumericValue == 2 ? "soft" : "hard"))
                .Where(dependency => dependency.Guid.Length > 0).ToArray();
            var incompatibilities = attributes.Where(attribute => attribute.TypeName == "BepInEx.BepInIncompatibility")
                .Select(attribute => attribute.Strings.FirstOrDefault() ?? "").Where(value => value.Length > 0).ToArray();
            var usesBaseUnityPlugin = baseType == "BepInEx.BaseUnityPlugin";
            if (!usesBaseUnityPlugin) unsupported.Add($"{typeName}: BepInPlugin type does not derive from BepInEx.BaseUnityPlugin");
            plugins.Add(new ManagedPluginReport(
                typeName,
                pluginAttribute.Strings.ElementAtOrDefault(0),
                pluginAttribute.Strings.ElementAtOrDefault(1),
                pluginAttribute.Strings.ElementAtOrDefault(2),
                processes,
                dependencies,
                incompatibilities,
                usesBaseUnityPlugin,
                methodAttributes.Where(attribute => attribute.TypeName.StartsWith("HarmonyLib.", StringComparison.Ordinal)).Select(attribute => attribute.TypeName).Distinct().ToArray()
            ));
        }

        foreach (var handle in reader.MemberReferences)
        {
            var member = reader.GetMemberReference(handle);
            var parent = FullTypeName(reader, member.Parent);
            if (parent.StartsWith("BepInEx.Preloader.", StringComparison.Ordinal))
                unsupported.Add($"{parent}.{reader.GetString(member.Name)}");
        }

        var targetFramework = ReadAttributes(reader, definition.GetCustomAttributes())
            .FirstOrDefault(attribute => attribute.TypeName == "System.Runtime.Versioning.TargetFrameworkAttribute")?.Strings.FirstOrDefault();
        var referenceNames = references.Select(reference => reference.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var hasBepInEx = referenceNames.Contains("BepInEx") || referenceNames.Contains("BepInEx.Unity.Mono") || plugins.Count > 0;
        var hasHarmony = referenceNames.Contains("0Harmony") || referenceNames.Contains("HarmonyX") || harmonyAttributes.Count > 0;
        var hasUnity = referenceNames.Any(name => name.StartsWith("UnityEngine", StringComparison.OrdinalIgnoreCase));
        var hasGameAssembly = referenceNames.Contains("Assembly-CSharp");
        var classification = hasBepInEx && hasUnity ? "bepinex5-unity-mono" : hasBepInEx ? "bepinex-managed" : "managed-assembly";

        return new ManagedInspectionReport(
            file,
            new ManagedAssemblyReport(reader.GetString(definition.Name), definition.Version.ToString(), targetFramework, references),
            typeReports.ToArray(),
            plugins.ToArray(),
            new ManagedSignalsReport(hasBepInEx, hasHarmony, hasUnity, hasGameAssembly, harmonyAttributes.ToArray()),
            classification,
            plugins.Count > 0 ? "partial" : "unknown",
            "B0",
            unsupported.ToArray(),
            new[] { "Metadata-only inspection: no assembly or plugin code was loaded or executed." }
        );
    }

    private static IEnumerable<DecodedAttribute> ReadAttributes(MetadataReader reader, CustomAttributeHandleCollection handles)
    {
        foreach (var handle in handles)
        {
            var attribute = reader.GetCustomAttribute(handle);
            var typeName = AttributeTypeName(reader, attribute.Constructor);
            var expectedStrings = typeName switch
            {
                "BepInEx.BepInPlugin" => 3,
                "BepInEx.BepInProcess" => 1,
                "BepInEx.BepInDependency" => 1,
                "BepInEx.BepInIncompatibility" => 1,
                "System.Runtime.Versioning.TargetFrameworkAttribute" => 1,
                _ => 0
            };
            var strings = new List<string>();
            int? numericValue = null;
            if (expectedStrings > 0)
            {
                try
                {
                    var blob = reader.GetBlobReader(attribute.Value);
                    if (blob.ReadUInt16() == 1)
                    {
                        for (var index = 0; index < expectedStrings; index++) strings.Add(blob.ReadSerializedString() ?? "");
                        if (typeName == "BepInEx.BepInDependency" && blob.RemainingBytes >= 6) numericValue = blob.ReadInt32();
                    }
                }
                catch (BadImageFormatException) { /* invalid metadata is represented by empty arguments */ }
            }
            yield return new DecodedAttribute(typeName, strings.ToArray(), numericValue);
        }
    }

    private static string AttributeTypeName(MetadataReader reader, EntityHandle constructor)
    {
        return constructor.Kind switch
        {
            HandleKind.MemberReference => FullTypeName(reader, reader.GetMemberReference((MemberReferenceHandle)constructor).Parent),
            HandleKind.MethodDefinition => FullTypeName(reader, reader.GetMethodDefinition((MethodDefinitionHandle)constructor).GetDeclaringType()),
            _ => "<unknown-attribute>"
        };
    }

    private static string FullTypeName(MetadataReader reader, EntityHandle handle)
    {
        return handle.Kind switch
        {
            HandleKind.TypeDefinition => JoinTypeName(reader.GetString(reader.GetTypeDefinition((TypeDefinitionHandle)handle).Namespace), reader.GetString(reader.GetTypeDefinition((TypeDefinitionHandle)handle).Name)),
            HandleKind.TypeReference => JoinTypeName(reader.GetString(reader.GetTypeReference((TypeReferenceHandle)handle).Namespace), reader.GetString(reader.GetTypeReference((TypeReferenceHandle)handle).Name)),
            _ => ""
        };
    }

    private static string JoinTypeName(string typeNamespace, string name) => typeNamespace.Length > 0 ? $"{typeNamespace}.{name}" : name;
}

internal sealed record DecodedAttribute(string TypeName, string[] Strings, int? NumericValue);
internal sealed record ManagedInspectionReport(string Path, ManagedAssemblyReport Assembly, ManagedTypeReport[] Types, ManagedPluginReport[] Plugins, ManagedSignalsReport Signals, string Classification, string Compatibility, string CompatibilityLevel, string[] UnsupportedSymbols, string[] Notes);
internal sealed record ManagedAssemblyReport(string Name, string Version, string? TargetFramework, AssemblyReferenceReport[] References);
internal sealed record AssemblyReferenceReport(string Name, string Version);
internal sealed record ManagedTypeReport(string Name, string BaseType, string[] Attributes);
internal sealed record ManagedSignalsReport(bool BepInExReferences, bool HarmonyReferences, bool UnityEngineReferences, bool AssemblyCSharpReferences, string[] HarmonyAttributes);
internal sealed record PluginDependencyReport(string Guid, string Kind);
internal sealed record ManagedPluginReport(string TypeName, string? Guid, string? Name, string? Version, string[] Processes, PluginDependencyReport[] Dependencies, string[] Incompatibilities, bool UsesBaseUnityPlugin, string[] HarmonyAttributes);
