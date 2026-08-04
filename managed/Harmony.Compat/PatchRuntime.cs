using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.ExceptionServices;

namespace HarmonyLib;

/// <summary>ModeDOCK H2/H3 cooperative dispatcher. Game adapters must route supported methods through this backend.</summary>
public static class HarmonyRuntime
{
    public static object? Invoke(MethodBase original, object? instance, object?[] arguments, Func<object?[], object?> originalCall)
    {
        var info = Harmony.GetPatchInfo(original);
        if (info is null) return originalCall(arguments);
        object? result = original is MethodInfo method && method.ReturnType != typeof(void) && method.ReturnType.IsValueType ? Activator.CreateInstance(method.ReturnType) : null;
        var states = new Dictionary<(string Owner, Type? Type), object?>();
        var runOriginal = true;
        Exception? exception = null;
        try
        {
            foreach (var patch in info.Prefixes) if (!InvokePatch(patch, original, instance, arguments, ref result, states, ref exception, true, false)) runOriginal = false;
            if (runOriginal) result = originalCall(arguments);
            foreach (var patch in info.Postfixes) InvokePatch(patch, original, instance, arguments, ref result, states, ref exception, false, false);
        }
        catch (Exception error) { exception = error is TargetInvocationException { InnerException: not null } ? error.InnerException : error; }
        foreach (var patch in info.Finalizers)
        {
            try { InvokePatch(patch, original, instance, arguments, ref result, states, ref exception, false, true); }
            catch (Exception error) { exception = error is TargetInvocationException { InnerException: not null } ? error.InnerException : error; }
        }
        if (exception is not null) ExceptionDispatchInfo.Capture(exception).Throw();
        return result;
    }

    private static bool InvokePatch(Patch patch, MethodBase original, object? instance, object?[] arguments, ref object? result, Dictionary<(string, Type?), object?> states, ref Exception? exception, bool prefix, bool finalizer)
    {
        var originalParameters = original.GetParameters();
        var patchParameters = patch.PatchMethod.GetParameters();
        var values = new object?[patchParameters.Length];
        var bindings = new Action<object?>?[patchParameters.Length];
        var resultBinding = -1;
        var exceptionBinding = -1;
        for (var index = 0; index < patchParameters.Length; index += 1)
        {
            var parameter = patchParameters[index];
            var name = parameter.Name ?? "";
            if (name == "__instance") values[index] = instance;
            else if (name == "__result") { values[index] = result; if (parameter.ParameterType.IsByRef) resultBinding = index; }
            else if (name == "__exception") { values[index] = exception; if (parameter.ParameterType.IsByRef) exceptionBinding = index; }
            else if (name == "__originalMethod") values[index] = original;
            else if (name == "__state")
            {
                var key = (patch.owner, patch.PatchMethod.DeclaringType);
                states.TryGetValue(key, out var state);
                values[index] = state;
                if (prefix) bindings[index] = value => states[key] = value;
            }
            else if (name.StartsWith("___", StringComparison.Ordinal))
            {
                var field = AccessTools.Field(original.DeclaringType ?? throw new InvalidOperationException("Original method has no declaring type."), name.Substring(3)) ?? throw new MissingFieldException(original.DeclaringType?.FullName, name.Substring(3));
                values[index] = field.GetValue(field.IsStatic ? null : instance);
                if (parameter.ParameterType.IsByRef) bindings[index] = value => field.SetValue(field.IsStatic ? null : instance, value);
            }
            else
            {
                var argumentIndex = name.StartsWith("__", StringComparison.Ordinal) && int.TryParse(name.Substring(2), out var positional) ? positional : Array.FindIndex(originalParameters, item => item.Name == name);
                if (argumentIndex < 0 || argumentIndex >= arguments.Length) throw new ArgumentException($"Patch parameter '{name}' does not match an original argument.");
                values[index] = arguments[argumentIndex];
                if (parameter.ParameterType.IsByRef) { var captured = argumentIndex; bindings[index] = value => arguments[captured] = value; }
            }
        }
        var returnValue = patch.PatchMethod.Invoke(null, values);
        for (var index = 0; index < bindings.Length; index += 1) if (bindings[index] is not null) bindings[index]!(values[index]);
        if (resultBinding >= 0) result = values[resultBinding];
        if (exceptionBinding >= 0) exception = values[exceptionBinding] as Exception;
        if (finalizer && typeof(Exception).IsAssignableFrom(patch.PatchMethod.ReturnType)) exception = returnValue as Exception;
        return !prefix || patch.PatchMethod.ReturnType != typeof(bool) || returnValue is not false;
    }
}
