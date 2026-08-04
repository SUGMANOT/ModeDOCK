using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Reflection.Emit;
using System.Text;

namespace HarmonyLib;

/// <summary>Validated H4 pipeline for controlled cooperative methods.</summary>
public static class HarmonyILPipeline
{
    public static string LastDiagnostic { get; private set; } = "";
    public static Action<string>? DiagnosticSink { get; set; }

    public static IReadOnlyList<CodeInstruction> Apply(MethodInfo original, IEnumerable<CodeInstruction> originalInstructions)
    {
        var source = Clone(originalInstructions).ToList();
        var current = source;
        var info = Harmony.GetPatchInfo(original);
        var owners = new List<string>();
        foreach (var patch in info?.Transpilers ?? Array.Empty<Patch>())
        {
            owners.Add($"{patch.owner}:{patch.PatchMethod.DeclaringType?.FullName}.{patch.PatchMethod.Name}");
            try
            {
                var parameters = patch.PatchMethod.GetParameters();
                if (parameters.Length != 1 || !typeof(IEnumerable<CodeInstruction>).IsAssignableFrom(parameters[0].ParameterType))
                    throw new PatchNotSupportedException("Controlled H4 transpilers must accept one IEnumerable<CodeInstruction> parameter.");
                var transformed = patch.PatchMethod.Invoke(null, new object?[] { Clone(current) }) as IEnumerable<CodeInstruction>
                    ?? throw new InvalidOperationException("Transpiler returned null or a non-instruction result.");
                current = Clone(transformed).ToList();
                ValidateStack(original, current);
            }
            catch (Exception error)
            {
                var actual = error is TargetInvocationException { InnerException: not null } ? error.InnerException : error;
                var diagnostic = BuildDiagnostic(original, source, current, owners, $"FAILED: {actual.Message}");
                Publish(diagnostic);
                throw new PatchNotSupportedException($"Transpiler '{owners[^1]}' failed: {actual.Message}\n{diagnostic}");
            }
        }
        ValidateStack(original, current);
        Publish(BuildDiagnostic(original, source, current, owners, "OK"));
        return current;
    }

    public static TDelegate Compile<TDelegate>(MethodInfo original, IEnumerable<CodeInstruction> instructions) where TDelegate : Delegate
    {
        if (!original.IsStatic) throw new PatchNotSupportedException("Controlled H4 dynamic regeneration currently supports static methods only.");
        var body = instructions.ToList(); ValidateStack(original, body);
        var parameters = original.GetParameters().Select(parameter => parameter.ParameterType).ToArray();
        var dynamic = new DynamicMethod($"ModeDOCK_H4_{original.Name}", original.ReturnType, parameters, typeof(HarmonyILPipeline).Module, true);
        var il = dynamic.GetILGenerator();
        var labels = new Dictionary<Label, Label>();
        Label Map(Label label) { if (!labels.TryGetValue(label, out var mapped)) { mapped = il.DefineLabel(); labels.Add(label, mapped); } return mapped; }
        foreach (var instruction in body) { foreach (var declaredLabel in instruction.labels) Map(declaredLabel); if (instruction.operand is Label operandLabel) Map(operandLabel); else if (instruction.operand is Label[] many) foreach (var item in many) Map(item); }
        foreach (var instruction in body)
        {
            foreach (var block in instruction.blocks) EmitBlock(il, block);
            foreach (var label in instruction.labels) il.MarkLabel(Map(label));
            Emit(il, instruction, Map);
        }
        try { return (TDelegate)dynamic.CreateDelegate(typeof(TDelegate)); }
        catch (Exception error) { throw new PatchNotSupportedException($"H4 dynamic method generation failed: {error.Message}"); }
    }

    public static void ValidateStack(MethodInfo original, IReadOnlyList<CodeInstruction> instructions)
    {
        if (instructions.Count == 0) throw new PatchNotSupportedException("Transpiler produced an empty method body.");
        var labelTargets = new Dictionary<Label, int>();
        for (var index = 0; index < instructions.Count; index++) foreach (var label in instructions[index].labels) labelTargets[label] = index;
        var depths = new Dictionary<int, int> { [0] = 0 }; var queue = new Queue<int>(); queue.Enqueue(0); var sawReturn = false;
        for (var index = 0; index < instructions.Count; index++)
            foreach (var block in instructions[index].blocks)
                if (block.blockType is ExceptionBlockType.BeginCatchBlock or ExceptionBlockType.BeginExceptFilterBlock or ExceptionBlockType.BeginFaultBlock or ExceptionBlockType.BeginFinallyBlock)
                {
                    var depth = block.blockType is ExceptionBlockType.BeginCatchBlock or ExceptionBlockType.BeginExceptFilterBlock ? 1 : 0;
                    if (!depths.ContainsKey(index)) { depths[index] = depth; queue.Enqueue(index); }
                }
        while (queue.Count > 0)
        {
            var index = queue.Dequeue(); var instruction = instructions[index]; var depth = depths[index];
            var (pop, push) = StackEffect(original, instruction); if (depth < pop) throw new PatchNotSupportedException($"Unverifiable IL: stack underflow at instruction {index} ({instruction.opcode}).");
            var nextDepth = depth - pop + push;
            if (instruction.opcode == OpCodes.Ret) { sawReturn = true; if (nextDepth != 0) throw new PatchNotSupportedException($"Unverifiable IL: stack depth is {nextDepth} after ret at instruction {index}."); continue; }
            foreach (var successor in Successors(index, instruction, instructions.Count, labelTargets))
            {
                if (depths.TryGetValue(successor, out var existing) && existing != nextDepth) throw new PatchNotSupportedException($"Unverifiable IL: stack merge mismatch at instruction {successor} ({existing} vs {nextDepth}).");
                if (!depths.ContainsKey(successor)) { depths[successor] = nextDepth; queue.Enqueue(successor); }
            }
        }
        if (!sawReturn) throw new PatchNotSupportedException("Unverifiable IL: no reachable ret instruction.");
    }

    private static IEnumerable<int> Successors(int index, CodeInstruction instruction, int count, IReadOnlyDictionary<Label, int> targets)
    {
        int Target(Label label) => targets.TryGetValue(label, out var target) ? target : throw new PatchNotSupportedException("Branch targets an undefined label.");
        if (instruction.opcode.FlowControl == FlowControl.Branch) { if (instruction.operand is not Label label) throw new PatchNotSupportedException("Branch operand is not a label."); yield return Target(label); yield break; }
        if (instruction.opcode.FlowControl == FlowControl.Cond_Branch)
        {
            if (instruction.operand is Label one) yield return Target(one); else if (instruction.operand is Label[] many) foreach (var label in many) yield return Target(label); else throw new PatchNotSupportedException("Conditional branch operand is invalid.");
            if (index + 1 < count) yield return index + 1; yield break;
        }
        if (instruction.opcode.FlowControl is FlowControl.Return or FlowControl.Throw) yield break;
        if (index + 1 < count) yield return index + 1;
    }

    private static (int Pop, int Push) StackEffect(MethodInfo original, CodeInstruction instruction)
    {
        int CountPop(StackBehaviour behavior) => behavior switch { StackBehaviour.Pop0 => 0, StackBehaviour.Pop1 or StackBehaviour.Popi or StackBehaviour.Popref => 1, StackBehaviour.Pop1_pop1 or StackBehaviour.Popi_pop1 or StackBehaviour.Popi_popi or StackBehaviour.Popi_popi8 or StackBehaviour.Popi_popr4 or StackBehaviour.Popi_popr8 or StackBehaviour.Popref_pop1 or StackBehaviour.Popref_popi => 2, StackBehaviour.Popi_popi_popi or StackBehaviour.Popref_popi_popi or StackBehaviour.Popref_popi_popi8 or StackBehaviour.Popref_popi_popr4 or StackBehaviour.Popref_popi_popr8 or StackBehaviour.Popref_popi_popref => 3, StackBehaviour.Varpop => VariablePop(), _ => throw new PatchNotSupportedException($"Unsupported stack pop behavior: {behavior}.") };
        int CountPush(StackBehaviour behavior) => behavior switch { StackBehaviour.Push0 => 0, StackBehaviour.Push1 or StackBehaviour.Pushi or StackBehaviour.Pushi8 or StackBehaviour.Pushr4 or StackBehaviour.Pushr8 or StackBehaviour.Pushref => 1, StackBehaviour.Push1_push1 => 2, StackBehaviour.Varpush => VariablePush(), _ => throw new PatchNotSupportedException($"Unsupported stack push behavior: {behavior}.") };
        int VariablePop()
        {
            if (instruction.opcode == OpCodes.Ret) return original.ReturnType == typeof(void) ? 0 : 1;
            if (instruction.operand is MethodBase method) return method.GetParameters().Length + (method.IsStatic ? 0 : 1);
            throw new PatchNotSupportedException($"Unsupported variable-pop opcode: {instruction.opcode}.");
        }
        int VariablePush() => instruction.operand is MethodInfo method && method.ReturnType != typeof(void) ? 1 : 0;
        var pop = CountPop(instruction.opcode.StackBehaviourPop);
        return (pop, CountPush(instruction.opcode.StackBehaviourPush));
    }

    private static void Emit(ILGenerator il, CodeInstruction instruction, Func<Label, Label> map)
    {
        var op = instruction.opcode; var operand = instruction.operand;
        if (operand is null) il.Emit(op);
        else if (operand is int intValue) il.Emit(op, intValue);
        else if (operand is long longValue) il.Emit(op, longValue);
        else if (operand is float floatValue) il.Emit(op, floatValue);
        else if (operand is double doubleValue) il.Emit(op, doubleValue);
        else if (operand is string text) il.Emit(op, text);
        else if (operand is Type type) il.Emit(op, type);
        else if (operand is FieldInfo field) il.Emit(op, field);
        else if (operand is MethodInfo method) il.Emit(op, method);
        else if (operand is ConstructorInfo constructor) il.Emit(op, constructor);
        else if (operand is Label label) il.Emit(op, map(label));
        else if (operand is Label[] labels) il.Emit(op, labels.Select(map).ToArray());
        else throw new PatchNotSupportedException($"Unsupported IL operand '{operand.GetType().FullName}' for {op}.");
    }

    private static void EmitBlock(ILGenerator il, ExceptionBlock block)
    {
        switch (block.blockType)
        {
            case ExceptionBlockType.BeginExceptionBlock: il.BeginExceptionBlock(); break;
            case ExceptionBlockType.BeginCatchBlock: il.BeginCatchBlock(block.catchType ?? typeof(Exception)); break;
            case ExceptionBlockType.BeginExceptFilterBlock: il.BeginExceptFilterBlock(); break;
            case ExceptionBlockType.BeginFaultBlock: il.BeginFaultBlock(); break;
            case ExceptionBlockType.BeginFinallyBlock: il.BeginFinallyBlock(); break;
            case ExceptionBlockType.EndExceptionBlock: il.EndExceptionBlock(); break;
            default: throw new PatchNotSupportedException($"Unknown exception block marker: {block.blockType}.");
        }
    }

    private static IEnumerable<CodeInstruction> Clone(IEnumerable<CodeInstruction> source) => source.Select(instruction => { var copy = new CodeInstruction(instruction.opcode, instruction.operand); copy.labels.AddRange(instruction.labels); copy.blocks.AddRange(instruction.blocks); return copy; });
    private static string BuildDiagnostic(MethodInfo original, IReadOnlyList<CodeInstruction> source, IReadOnlyList<CodeInstruction> result, IReadOnlyList<string> owners, string status)
    {
        static string Dump(IEnumerable<CodeInstruction> instructions) => string.Join("\n", instructions.Select((instruction, index) => $"{index:D4}: {instruction.opcode} {instruction.operand}"));
        return $"ModeDOCK H4 {status}\nMethod: {original.DeclaringType?.FullName}.{original.Name}\nOwners: {(owners.Count == 0 ? "none" : string.Join(", ", owners))}\nOriginal IL:\n{Dump(source)}\nFinal IL:\n{Dump(result)}";
    }
    private static void Publish(string diagnostic) { LastDiagnostic = diagnostic; DiagnosticSink?.Invoke(diagnostic); }
}
