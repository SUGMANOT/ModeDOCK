using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Reflection.Emit;
using System.Text.Json;
using HarmonyLib;

namespace ModeDOCK.HarmonyHarness;

internal static class Program
{
    private static int Main()
    {
        try
        {
            var behavioral = new Harmony("fixture.behavior");
            behavioral.Patch(Target.AddMethod, new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.AddPrefix))!), new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.AddPostfix))!), finalizer: new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.ObserveFinalizer))!));
            var target = new Target();
            Assert(target.Add(3) == 16, "instance/ref/state/result/field patch failed");
            Assert(Patches.LastInstance == target && Patches.LastOriginal == Target.AddMethod, "special injected parameters failed");
            Assert(Patches.FinalizerRuns == 1, "Finalizer did not run with Prefix/Postfix");
            behavioral.UnpatchAll();
            Assert(new Target().Add(3) == 5, "unpatch did not restore cooperative original path");

            var skip = new Harmony("fixture.skip");
            skip.Patch(Target.SkipMethod, new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.SkipPrefix))!));
            Assert(new Target().Skip(6) == 99, "bool Prefix did not skip original");
            skip.UnpatchAll();

            var refOut = new Harmony("fixture.refout");
            refOut.Patch(Target.TransformMethod, new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.TransformPrefix))!), new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.TransformPostfix))!));
            var value = 3; var result = new Target().Transform(ref value, out var doubled);
            Assert(value == 6 && doubled == 11 && result == 16, "ref/out argument binding failed");
            refOut.UnpatchAll();

            var staticPatch = new Harmony("fixture.static");
            staticPatch.Patch(Target.SquareMethod, new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.SquarePrefix))!), new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.SquarePostfix))!));
            Assert(Target.Square(3) == 32, "static Prefix/Postfix failed");
            staticPatch.UnpatchAll();

            Patches.Events.Clear();
            var a = new Harmony("owner.a"); var b = new Harmony("owner.b"); var c = new Harmony("owner.c");
            a.Patch(Target.OrderMethod, Configured(nameof(Patches.OrderA), Priority.Low, before: new[] { "owner.b" }));
            b.Patch(Target.OrderMethod, Configured(nameof(Patches.OrderB), Priority.High));
            c.Patch(Target.OrderMethod, Configured(nameof(Patches.OrderC), Priority.First, after: new[] { "owner.b" }));
            new Target().Order();
            Assert(string.Join("", Patches.Events) == "ABCO", "priority/before/after ordering failed");
            Assert(Harmony.GetPatchInfo(Target.OrderMethod)?.Prefixes.Length == 3, "patch registry did not expose owners");
            b.UnpatchAll(); Patches.Events.Clear(); new Target().Order();
            Assert(string.Join("", Patches.Events) == "CAO", "unpatch by owner removed the wrong patches");
            a.UnpatchAll(); c.UnpatchAll();

            var attributeOwner = new Harmony("fixture.attributes");
            attributeOwner.PatchAll(Assembly.GetExecutingAssembly());
            Assert(Target.AttributeTarget(3) == 8, "HarmonyPatch attribute discovery failed");
            attributeOwner.UnpatchAll();

            var suppress = new Harmony("fixture.finalizer.suppress");
            suppress.Patch(Target.ThrowMethod, finalizer: new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.SuppressFinalizer))!));
            Assert(new Target().Throwing() == 0 && Patches.SuppressedExceptions == 1, "H3 Finalizer did not suppress the exception");
            suppress.UnpatchAll();
            var replace = new Harmony("fixture.finalizer.replace");
            replace.Patch(Target.ThrowMethod, finalizer: new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.ReplaceFinalizer))!));
            AssertException("replacement", () => new Target().Throwing()); replace.UnpatchAll();

            var h4a = new Harmony("owner.transpiler.a"); var h4b = new Harmony("owner.transpiler.b");
            h4a.Patch(Target.TranspileMethod, transpiler: new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.AddTwoTranspiler))!));
            h4b.Patch(Target.TranspileMethod, transpiler: new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.TripleTranspiler))!));
            var originalIl = OriginalInstructions();
            var transformed = HarmonyILPipeline.Apply(Target.TranspileMethod, originalIl);
            var generated = HarmonyILPipeline.Compile<Func<int, int>>(Target.TranspileMethod, transformed);
            Assert(generated(3) == 15, "H4 chained transpilers or dynamic regeneration failed");
            Assert(HarmonyILPipeline.LastDiagnostic.Contains("owner.transpiler.a", StringComparison.Ordinal) && HarmonyILPipeline.LastDiagnostic.Contains("Original IL", StringComparison.Ordinal), "H4 diagnostic dump is incomplete");
            h4b.UnpatchAll();
            Assert(HarmonyILPipeline.Compile<Func<int, int>>(Target.TranspileMethod, HarmonyILPipeline.Apply(Target.TranspileMethod, originalIl))(3) == 5, "H4 regeneration after unpatch failed");
            h4a.UnpatchAll();

            var labelSource = new DynamicMethod("labels", typeof(void), Type.EmptyTypes).GetILGenerator(); var trueLabel = labelSource.DefineLabel();
            var branch = new List<CodeInstruction> { new(OpCodes.Ldarg_0), new(OpCodes.Brtrue_S, trueLabel), new(OpCodes.Ldc_I4_0), new(OpCodes.Ret), new(OpCodes.Ldc_I4_1), new(OpCodes.Ret) };
            branch[4].labels.Add(trueLabel);
            var branchDelegate = HarmonyILPipeline.Compile<Func<int, int>>(Target.TranspileMethod, branch);
            Assert(branchDelegate(0) == 0 && branchDelegate(2) == 1, "H4 labels/branch regeneration failed");
            var exceptionLabelSource = new DynamicMethod("exception-labels", typeof(void), Type.EmptyTypes).GetILGenerator(); var exceptionDone = exceptionLabelSource.DefineLabel();
            var exceptionBody = new List<CodeInstruction> { new(OpCodes.Nop), new(OpCodes.Leave_S, exceptionDone), new(OpCodes.Nop), new(OpCodes.Endfinally), new(OpCodes.Nop), new(OpCodes.Ret) };
            exceptionBody[0].blocks.Add(new ExceptionBlock(ExceptionBlockType.BeginExceptionBlock)); exceptionBody[2].blocks.Add(new ExceptionBlock(ExceptionBlockType.BeginFinallyBlock)); exceptionBody[4].blocks.Add(new ExceptionBlock(ExceptionBlockType.EndExceptionBlock)); exceptionBody[4].labels.Add(exceptionDone);
            HarmonyILPipeline.Compile<Action>(Target.ExceptionTemplateMethod, exceptionBody)();

            var broken = new Harmony("owner.transpiler.broken");
            broken.Patch(Target.TranspileMethod, transpiler: new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.BrokenTranspiler))!));
            AssertThrows("owner.transpiler.broken", () => HarmonyILPipeline.Apply(Target.TranspileMethod, originalIl)); broken.UnpatchAll();

            var unsupported = new Harmony("fixture.unsupported");
            AssertThrows("Abstract", () => unsupported.Patch(typeof(AbstractTarget).GetMethod(nameof(AbstractTarget.Run))!, prefix: new HarmonyMethod(AccessTools.Method(typeof(Patches), nameof(Patches.EmptyPrefix))!)));

            Assert(AccessTools.TypeByName(typeof(Target).FullName!) == typeof(Target), "TypeByName failed");
            Assert(AccessTools.DeclaredField(typeof(Target), "_secret") is not null && AccessTools.Constructor(typeof(Target)) is not null, "AccessTools field/constructor failed");
            Console.WriteLine(JsonSerializer.Serialize(new { status = "ok", level = "H4", tests = 18, patchedMethods = Harmony.GetAllPatchedMethods().Count() }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }

    private static HarmonyMethod Configured(string name, int priority, string[]? before = null, string[]? after = null) => new(AccessTools.Method(typeof(Patches), name)!) { priority = priority, before = before ?? Array.Empty<string>(), after = after ?? Array.Empty<string>() };
    private static void Assert(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
    private static void AssertThrows(string expected, Action action) { try { action(); } catch (PatchNotSupportedException error) when (error.Message.Contains(expected, StringComparison.OrdinalIgnoreCase)) { return; } throw new InvalidOperationException($"Expected PatchNotSupportedException containing '{expected}'."); }
    private static void AssertException(string expected, Action action) { try { action(); } catch (Exception error) when (error.Message.Contains(expected, StringComparison.OrdinalIgnoreCase)) { return; } throw new InvalidOperationException($"Expected exception containing '{expected}'."); }
    private static IReadOnlyList<CodeInstruction> OriginalInstructions() => new CodeInstruction[] { new(OpCodes.Ldarg_0), new(OpCodes.Ldc_I4_1), new(OpCodes.Add), new(OpCodes.Ret) };
}

internal sealed class Target
{
    private int _secret = 2;
    internal static readonly MethodInfo AddMethod = AccessTools.DeclaredMethod(typeof(Target), nameof(Add))!;
    internal static readonly MethodInfo SkipMethod = AccessTools.DeclaredMethod(typeof(Target), nameof(Skip))!;
    internal static readonly MethodInfo TransformMethod = AccessTools.DeclaredMethod(typeof(Target), nameof(Transform))!;
    internal static readonly MethodInfo SquareMethod = AccessTools.DeclaredMethod(typeof(Target), nameof(Square))!;
    internal static readonly MethodInfo OrderMethod = AccessTools.DeclaredMethod(typeof(Target), nameof(Order))!;
    internal static readonly MethodInfo AttributeMethod = AccessTools.DeclaredMethod(typeof(Target), nameof(AttributeTarget))!;
    internal static readonly MethodInfo ThrowMethod = AccessTools.DeclaredMethod(typeof(Target), nameof(Throwing))!;
    internal static readonly MethodInfo TranspileMethod = AccessTools.DeclaredMethod(typeof(Target), nameof(TranspileTemplate))!;
    internal static readonly MethodInfo ExceptionTemplateMethod = AccessTools.DeclaredMethod(typeof(Target), nameof(ExceptionTemplate))!;
    public int Add(int value) { object?[] args = { value }; return (int)HarmonyRuntime.Invoke(AddMethod, this, args, values => _secret + (int)values[0]!)!; }
    public int Skip(int value) { object?[] args = { value }; return (int)HarmonyRuntime.Invoke(SkipMethod, this, args, values => (int)values[0]!)!; }
    public int Transform(ref int value, out int doubled)
    {
        object?[] args = { value, 0 };
        var result = (int)HarmonyRuntime.Invoke(TransformMethod, this, args, values => { var current = (int)values[0]!; values[0] = current + 1; values[1] = current * 2; return (int)values[0]! + (int)values[1]!; })!;
        value = (int)args[0]!; doubled = (int)args[1]!; return result;
    }
    public static int Square(int value) { object?[] args = { value }; return (int)HarmonyRuntime.Invoke(SquareMethod, null, args, values => (int)values[0]! * (int)values[0]!)!; }
    public void Order() { object?[] args = Array.Empty<object?>(); HarmonyRuntime.Invoke(OrderMethod, this, args, _ => { Patches.Events.Add("O"); return null; }); }
    public static int AttributeTarget(int value) { object?[] args = { value }; return (int)HarmonyRuntime.Invoke(AttributeMethod, null, args, values => (int)values[0]!)!; }
    public int Throwing() { object?[] args = Array.Empty<object?>(); return (int)HarmonyRuntime.Invoke(ThrowMethod, this, args, _ => throw new ApplicationException("original failure"))!; }
    public static int TranspileTemplate(int value) => value + 1;
    public static void ExceptionTemplate() { }
}

internal static class Patches
{
    internal static Target? LastInstance; internal static MethodBase? LastOriginal; internal static List<string> Events { get; } = new(); internal static int FinalizerRuns; internal static int SuppressedExceptions;
    public static void AddPrefix(ref int value, Target __instance, out int __state, MethodBase __originalMethod, ref int ____secret) { LastInstance = __instance; LastOriginal = __originalMethod; __state = ____secret; value += 1; ____secret = 10; }
    public static void AddPostfix(ref int __result, int __state) => __result += __state;
    public static bool SkipPrefix(ref int __result) { __result = 99; return false; }
    public static void TransformPrefix(ref int value) => value += 2;
    public static void TransformPostfix(ref int doubled) => doubled += 1;
    public static void SquarePrefix(ref int value) => value += 1;
    public static void SquarePostfix(ref int __result) => __result *= 2;
    public static void OrderA() => Events.Add("A"); public static void OrderB() => Events.Add("B"); public static void OrderC() => Events.Add("C");
    public static void EmptyPrefix() { }
    public static Exception? ObserveFinalizer(Exception? __exception) { FinalizerRuns++; return __exception; }
    public static Exception? SuppressFinalizer(Exception? __exception) { if (__exception is not null) SuppressedExceptions++; return null; }
    public static Exception? ReplaceFinalizer(Exception? __exception) => __exception is null ? null : new InvalidOperationException("replacement failure", __exception);
    public static IEnumerable<CodeInstruction> AddTwoTranspiler(IEnumerable<CodeInstruction> instructions) => instructions.Select(instruction => instruction.opcode == OpCodes.Ldc_I4_1 ? new CodeInstruction(OpCodes.Ldc_I4_2) : instruction);
    public static IEnumerable<CodeInstruction> TripleTranspiler(IEnumerable<CodeInstruction> instructions) { var list = instructions.ToList(); var index = list.FindIndex(instruction => instruction.opcode == OpCodes.Ret); list.Insert(index, new CodeInstruction(OpCodes.Ldc_I4_3)); list.Insert(index + 1, new CodeInstruction(OpCodes.Mul)); return list; }
    public static IEnumerable<CodeInstruction> BrokenTranspiler(IEnumerable<CodeInstruction> instructions) => new CodeInstruction[] { new(OpCodes.Pop), new(OpCodes.Ret) };
}

[HarmonyPatch(typeof(Target), nameof(Target.AttributeTarget))]
internal static class AttributePatch
{
    [HarmonyPrefix] public static void Prefix(ref int value) => value += 5;
}

internal abstract class AbstractTarget { public abstract void Run(); }
