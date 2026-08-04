using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace HarmonyLib;

public static class AccessTools
{
    public const BindingFlags all = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static;
    public static Type? TypeByName(string name) => AppDomain.CurrentDomain.GetAssemblies().SelectMany(GetTypesFromAssembly).FirstOrDefault(type => type.FullName == name || type.Name == name);
    public static MethodInfo? Method(Type type, string name, Type[]? parameters = null) => FindMethod(type, name, parameters, false);
    public static MethodInfo? DeclaredMethod(Type type, string name, Type[]? parameters = null) => FindMethod(type, name, parameters, true);
    public static PropertyInfo? Property(Type type, string name) => FindHierarchy(type, current => current.GetProperty(name, all | BindingFlags.DeclaredOnly));
    public static PropertyInfo? DeclaredProperty(Type type, string name) => type.GetProperty(name, all | BindingFlags.DeclaredOnly);
    public static MethodInfo? PropertyGetter(Type type, string name) => Property(type, name)?.GetGetMethod(true);
    public static MethodInfo? PropertySetter(Type type, string name) => Property(type, name)?.GetSetMethod(true);
    public static FieldInfo? Field(Type type, string name) => FindHierarchy(type, current => current.GetField(name, all | BindingFlags.DeclaredOnly));
    public static FieldInfo? DeclaredField(Type type, string name) => type.GetField(name, all | BindingFlags.DeclaredOnly);
    public static ConstructorInfo? Constructor(Type type, Type[]? parameters = null) => type.GetConstructor(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance, null, parameters ?? Type.EmptyTypes, null);
    public static ConstructorInfo? DeclaredConstructor(Type type, Type[]? parameters = null) => type.GetConstructor(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly, null, parameters ?? Type.EmptyTypes, null);
    public static List<MethodInfo> GetDeclaredMethods(Type type) => type.GetMethods(all | BindingFlags.DeclaredOnly).ToList();
    public static List<FieldInfo> GetDeclaredFields(Type type) => type.GetFields(all | BindingFlags.DeclaredOnly).ToList();
    public static Type[] GetTypesFromAssembly(Assembly assembly) { try { return assembly.GetTypes(); } catch (ReflectionTypeLoadException error) { return error.Types.Where(type => type is not null).Cast<Type>().ToArray(); } }

    private static MethodInfo? FindMethod(Type type, string name, Type[]? parameters, bool declared)
    {
        var flags = all | (declared ? BindingFlags.DeclaredOnly : 0);
        if (parameters is not null) return type.GetMethod(name, flags, null, parameters, null);
        return type.GetMethods(flags).FirstOrDefault(method => method.Name == name);
    }
    private static T? FindHierarchy<T>(Type? type, Func<Type, T?> getter) where T : class { while (type is not null) { var result = getter(type); if (result is not null) return result; type = type.BaseType; } return null; }
}
