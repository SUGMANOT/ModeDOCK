using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace HarmonyLib;

public sealed class Patch
{
    internal Patch(int index, string owner, HarmonyMethod method)
    {
        this.index = index; this.owner = owner; PatchMethod = method.methodInfo ?? throw new ArgumentException("HarmonyMethod has no methodInfo.");
        priority = method.priority; before = method.before ?? Array.Empty<string>(); after = method.after ?? Array.Empty<string>();
    }
    public readonly int index;
    public readonly string owner;
    public readonly int priority;
    public readonly string[] before;
    public readonly string[] after;
    public MethodInfo PatchMethod { get; }
}

public sealed class PatchInfo
{
    internal PatchInfo(Patch[] prefixes, Patch[] postfixes, Patch[] transpilers, Patch[] finalizers) { Prefixes = prefixes; Postfixes = postfixes; Transpilers = transpilers; Finalizers = finalizers; }
    public Patch[] Prefixes { get; }
    public Patch[] Postfixes { get; }
    public Patch[] Transpilers { get; }
    public Patch[] Finalizers { get; }
}

public sealed class Harmony
{
    public Harmony(string id) { if (string.IsNullOrWhiteSpace(id)) throw new ArgumentException("Harmony owner ID is required.", nameof(id)); Id = id; }
    public string Id { get; }
    public MethodInfo Patch(MethodBase original, HarmonyMethod? prefix = null, HarmonyMethod? postfix = null, HarmonyMethod? transpiler = null, HarmonyMethod? finalizer = null)
    {
        ValidateOriginal(original);
        if (prefix?.methodInfo is null && postfix?.methodInfo is null && transpiler?.methodInfo is null && finalizer?.methodInfo is null) throw new ArgumentException("At least one patch method is required.");
        PatchRegistry.Add(original, Id, prefix, postfix, transpiler, finalizer);
        return original as MethodInfo ?? throw new PatchNotSupportedException("Constructor patching is not implemented at H2.");
    }
    public void UnpatchAll(string? harmonyID = null) => PatchRegistry.RemoveOwner(harmonyID ?? Id);
    public void PatchAll() => PatchAll(Assembly.GetCallingAssembly());
    public void PatchAll(Assembly assembly)
    {
        foreach (var type in AccessTools.GetTypesFromAssembly(assembly)) PatchType(type);
    }
    public static PatchInfo? GetPatchInfo(MethodBase method) => PatchRegistry.Get(method);
    public static IEnumerable<MethodBase> GetAllPatchedMethods() => PatchRegistry.Methods;

    private void PatchType(Type type)
    {
        var classTargets = type.GetCustomAttributes(typeof(HarmonyPatch), false).Cast<HarmonyPatch>().ToArray();
        if (classTargets.Length == 0) return;
        foreach (var unsupported in new[] { typeof(HarmonyPrepare), typeof(HarmonyCleanup), typeof(HarmonyTargetMethod), typeof(HarmonyTargetMethods) })
            if (type.GetMethods(AccessTools.all).Any(method => method.IsDefined(unsupported, false)))
                throw new PatchNotSupportedException($"{unsupported.Name} discovery is not implemented at compatibility level H2.");
        var target = ResolveTarget(classTargets);
        var prefix = FindPatch(type, typeof(HarmonyPrefix));
        var postfix = FindPatch(type, typeof(HarmonyPostfix));
        var transpiler = FindPatch(type, typeof(HarmonyTranspiler));
        var finalizer = FindPatch(type, typeof(HarmonyFinalizer));
        Patch(target, prefix, postfix, transpiler, finalizer);
    }
    private static HarmonyMethod? FindPatch(Type type, Type attributeType)
    {
        var method = type.GetMethods(AccessTools.all).SingleOrDefault(candidate => candidate.IsDefined(attributeType, false));
        if (method is null) return null;
        var harmony = new HarmonyMethod(method);
        harmony.priority = method.GetCustomAttribute<HarmonyPriority>()?.Priority ?? type.GetCustomAttribute<HarmonyPriority>()?.Priority ?? Priority.Normal;
        harmony.before = method.GetCustomAttribute<HarmonyBefore>()?.Before ?? type.GetCustomAttribute<HarmonyBefore>()?.Before ?? Array.Empty<string>();
        harmony.after = method.GetCustomAttribute<HarmonyAfter>()?.After ?? type.GetCustomAttribute<HarmonyAfter>()?.After ?? Array.Empty<string>();
        return harmony;
    }
    private static MethodBase ResolveTarget(HarmonyPatch[] attributes)
    {
        var type = attributes.Select(attribute => attribute.DeclaringType).FirstOrDefault(value => value is not null) ?? throw new ArgumentException("HarmonyPatch target type is missing.");
        var name = attributes.Select(attribute => attribute.MethodName).FirstOrDefault(value => value is not null) ?? throw new ArgumentException("HarmonyPatch target method is missing.");
        var args = attributes.Select(attribute => attribute.ArgumentTypes).FirstOrDefault(value => value is not null);
        return AccessTools.Method(type, name, args) ?? throw new MissingMethodException(type.FullName, name);
    }
    private static void ValidateOriginal(MethodBase original)
    {
        if (original is not MethodInfo) throw new PatchNotSupportedException("Constructor patching is not implemented at H2.");
        if (original.ContainsGenericParameters) throw new PatchNotSupportedException("Open generic methods are not supported.");
        if (original.IsAbstract) throw new PatchNotSupportedException("Abstract methods are not supported.");
        if ((original.CallingConvention & CallingConventions.VarArgs) != 0) throw new PatchNotSupportedException("Varargs methods are not supported.");
        var implementation = original.GetMethodImplementationFlags();
        if ((implementation & (MethodImplAttributes.InternalCall | MethodImplAttributes.Native | MethodImplAttributes.Unmanaged)) != 0) throw new PatchNotSupportedException("Native, external and internal-call methods are not supported.");
    }
}

internal static class PatchRegistry
{
    private sealed class Entry { public List<Patch> Prefixes { get; } = new(); public List<Patch> Postfixes { get; } = new(); public List<Patch> Transpilers { get; } = new(); public List<Patch> Finalizers { get; } = new(); }
    private static readonly object Gate = new();
    private static readonly Dictionary<MethodBase, Entry> Entries = new();
    private static int _index;
    public static IEnumerable<MethodBase> Methods { get { lock (Gate) return Entries.Keys.ToArray(); } }
    public static void Add(MethodBase original, string owner, HarmonyMethod? prefix, HarmonyMethod? postfix, HarmonyMethod? transpiler, HarmonyMethod? finalizer)
    {
        lock (Gate)
        {
            if (prefix?.methodInfo is { IsStatic: false } || postfix?.methodInfo is { IsStatic: false } || transpiler?.methodInfo is { IsStatic: false } || finalizer?.methodInfo is { IsStatic: false }) throw new PatchNotSupportedException("Patch methods must be static.");
            if (!Entries.TryGetValue(original, out var entry)) { entry = new Entry(); Entries.Add(original, entry); }
            if (prefix?.methodInfo is not null) entry.Prefixes.Add(new Patch(_index++, owner, prefix));
            if (postfix?.methodInfo is not null) entry.Postfixes.Add(new Patch(_index++, owner, postfix));
            if (transpiler?.methodInfo is not null) entry.Transpilers.Add(new Patch(_index++, owner, transpiler));
            if (finalizer?.methodInfo is not null) entry.Finalizers.Add(new Patch(_index++, owner, finalizer));
        }
    }
    public static PatchInfo? Get(MethodBase method)
    {
        lock (Gate) return Entries.TryGetValue(method, out var entry) ? new PatchInfo(Order(entry.Prefixes), Order(entry.Postfixes), Order(entry.Transpilers), Order(entry.Finalizers)) : null;
    }
    public static void RemoveOwner(string owner)
    {
        lock (Gate)
        {
            foreach (var entry in Entries.Values) { entry.Prefixes.RemoveAll(patch => patch.owner == owner); entry.Postfixes.RemoveAll(patch => patch.owner == owner); entry.Transpilers.RemoveAll(patch => patch.owner == owner); entry.Finalizers.RemoveAll(patch => patch.owner == owner); }
            foreach (var key in Entries.Where(pair => pair.Value.Prefixes.Count == 0 && pair.Value.Postfixes.Count == 0 && pair.Value.Transpilers.Count == 0 && pair.Value.Finalizers.Count == 0).Select(pair => pair.Key).ToArray()) Entries.Remove(key);
        }
    }
    private static Patch[] Order(List<Patch> source)
    {
        var remaining = source.OrderByDescending(patch => patch.priority).ThenBy(patch => patch.index).ToList();
        var result = new List<Patch>();
        while (remaining.Count > 0)
        {
            var available = remaining.Where(candidate => !remaining.Any(other => MustRunBefore(other, candidate))).OrderByDescending(patch => patch.priority).ThenBy(patch => patch.index).FirstOrDefault();
            if (available is null) throw new InvalidOperationException("Harmony before/after ordering contains a cycle.");
            result.Add(available); remaining.Remove(available);
        }
        return result.ToArray();
    }
    private static bool MustRunBefore(Patch left, Patch right) => left.before.Contains(right.owner, StringComparer.Ordinal) || right.after.Contains(left.owner, StringComparer.Ordinal);
}
