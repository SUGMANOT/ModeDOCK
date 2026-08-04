using System;
using System.Reflection;
using System.Reflection.Emit;

namespace HarmonyLib;

public enum MethodType { Normal, Getter, Setter, Constructor, StaticConstructor, Enumerator, Async }
public enum ArgumentType { Normal, Ref, Out, Pointer }
public static class Priority { public const int Last = 0; public const int VeryLow = 100; public const int Low = 200; public const int LowerThanNormal = 300; public const int Normal = 400; public const int HigherThanNormal = 500; public const int High = 600; public const int VeryHigh = 700; public const int First = 800; }

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class HarmonyPatch : Attribute
{
    public HarmonyPatch() { }
    public HarmonyPatch(Type declaringType) => DeclaringType = declaringType;
    public HarmonyPatch(string methodName) => MethodName = methodName;
    public HarmonyPatch(Type declaringType, string methodName) { DeclaringType = declaringType; MethodName = methodName; }
    public HarmonyPatch(Type declaringType, string methodName, params Type[] argumentTypes) { DeclaringType = declaringType; MethodName = methodName; ArgumentTypes = argumentTypes; }
    public HarmonyPatch(MethodType methodType) => MethodType = methodType;
    public Type? DeclaringType { get; }
    public string? MethodName { get; }
    public Type[]? ArgumentTypes { get; }
    public MethodType? MethodType { get; }
}

[AttributeUsage(AttributeTargets.Method)] public sealed class HarmonyPrefix : Attribute { }
[AttributeUsage(AttributeTargets.Method)] public sealed class HarmonyPostfix : Attribute { }
[AttributeUsage(AttributeTargets.Method)] public sealed class HarmonyFinalizer : Attribute { }
[AttributeUsage(AttributeTargets.Method)] public sealed class HarmonyTranspiler : Attribute { }
[AttributeUsage(AttributeTargets.Method)] public sealed class HarmonyPrepare : Attribute { }
[AttributeUsage(AttributeTargets.Method)] public sealed class HarmonyCleanup : Attribute { }
[AttributeUsage(AttributeTargets.Method)] public sealed class HarmonyTargetMethod : Attribute { }
[AttributeUsage(AttributeTargets.Method)] public sealed class HarmonyTargetMethods : Attribute { }
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)] public sealed class HarmonyPriority : Attribute { public HarmonyPriority(int priority) => Priority = priority; public int Priority { get; } }
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)] public sealed class HarmonyBefore : Attribute { public HarmonyBefore(params string[] before) => Before = before; public string[] Before { get; } }
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)] public sealed class HarmonyAfter : Attribute { public HarmonyAfter(params string[] after) => After = after; public string[] After { get; } }

public sealed class HarmonyMethod
{
    public HarmonyMethod() { }
    public HarmonyMethod(MethodInfo method) => methodInfo = method;
    public MethodInfo? methodInfo;
    public int priority = Priority.Normal;
    public string[] before = Array.Empty<string>();
    public string[] after = Array.Empty<string>();
}

public sealed class CodeInstruction
{
    public CodeInstruction(OpCode opcode, object? operand = null) { this.opcode = opcode; this.operand = operand; }
    public OpCode opcode;
    public object? operand;
    public System.Collections.Generic.List<Label> labels = new();
    public System.Collections.Generic.List<ExceptionBlock> blocks = new();
}

public enum ExceptionBlockType { BeginExceptionBlock, BeginCatchBlock, BeginExceptFilterBlock, BeginFaultBlock, BeginFinallyBlock, EndExceptionBlock }
public readonly struct ExceptionBlock { public ExceptionBlock(ExceptionBlockType blockType, Type? catchType = null) { this.blockType = blockType; this.catchType = catchType; } public readonly ExceptionBlockType blockType; public readonly Type? catchType; }

public sealed class PatchNotSupportedException : NotSupportedException
{
    public PatchNotSupportedException(string reason) : base(reason) => Reason = reason;
    public string Reason { get; }
}
