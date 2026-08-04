using System;
using System.Collections.Generic;
using BepInEx.Configuration;
using BepInEx.Logging;
using UnityEngine;

namespace BepInEx;

[AttributeUsage(AttributeTargets.Class)]
public sealed class BepInPlugin : Attribute
{
    public BepInPlugin(string guid, string name, string version) { GUID = guid; Name = name; Version = System.Version.Parse(version); }
    public string GUID { get; }
    public string Name { get; }
    public Version Version { get; }
}

[AttributeUsage(AttributeTargets.Class, AllowMultiple = true)]
public sealed class BepInProcess : Attribute { public BepInProcess(string processName) => ProcessName = processName; public string ProcessName { get; } }

[AttributeUsage(AttributeTargets.Class, AllowMultiple = true)]
public sealed class BepInDependency : Attribute
{
    public enum DependencyFlags { HardDependency = 1, SoftDependency = 2 }
    public BepInDependency(string dependencyGuid) : this(dependencyGuid, DependencyFlags.HardDependency) { }
    public BepInDependency(string dependencyGuid, DependencyFlags flags) { DependencyGUID = dependencyGuid; Flags = flags; }
    public string DependencyGUID { get; }
    public DependencyFlags Flags { get; }
}

[AttributeUsage(AttributeTargets.Class, AllowMultiple = true)]
public sealed class BepInIncompatibility : Attribute { public BepInIncompatibility(string guid) => IncompatibilityGUID = guid; public string IncompatibilityGUID { get; } }

public sealed class PluginInfo
{
    public BaseUnityPlugin? Instance { get; internal set; }
    public string Location { get; internal set; } = "";
    public BepInPlugin Metadata { get; internal set; } = new("invalid", "Invalid", "0.0.0");
    public string DependencyState { get; internal set; } = "unknown";
    public string LoadState { get; internal set; } = "pending";
    public string? LoadError { get; internal set; }
}

internal sealed class PluginConstructionContext
{
    [ThreadStatic] private static PluginConstructionContext? _current;
    public static PluginConstructionContext Current => _current ?? throw new InvalidOperationException("BaseUnityPlugin was created outside the ModeDOCK chainloader.");
    public static void Set(PluginConstructionContext? value) => _current = value;
    public PluginInfo Info { get; set; } = null!;
    public ManualLogSource Logger { get; set; } = null!;
    public ConfigFile Config { get; set; } = null!;
}

public abstract class BaseUnityPlugin : MonoBehaviour
{
    protected BaseUnityPlugin()
    {
        var context = PluginConstructionContext.Current;
        Info = context.Info;
        Logger = context.Logger;
        Config = context.Config;
    }
    public ConfigFile Config { get; }
    public PluginInfo Info { get; }
    public ManualLogSource Logger { get; }
}

public static class Paths
{
    public static string GameRootPath { get; internal set; } = "";
    public static string GameDataPath { get; internal set; } = "";
    public static string ManagedPath { get; internal set; } = "";
    public static string BepInExRootPath { get; internal set; } = "";
    public static string PluginPath { get; internal set; } = "";
    public static string ConfigPath { get; internal set; } = "";
    public static string CachePath { get; internal set; } = "";
    public static string ProcessName { get; internal set; } = "";
    public static string ExecutablePath { get; internal set; } = "";

    public static void Configure(IReadOnlyDictionary<string, string> values)
    {
        string Value(string key) => values.TryGetValue(key, out var value) ? value : "";
        GameRootPath = Value(nameof(GameRootPath)); GameDataPath = Value(nameof(GameDataPath)); ManagedPath = Value(nameof(ManagedPath));
        BepInExRootPath = Value(nameof(BepInExRootPath)); PluginPath = Value(nameof(PluginPath)); ConfigPath = Value(nameof(ConfigPath));
        CachePath = Value(nameof(CachePath)); ProcessName = Value(nameof(ProcessName)); ExecutablePath = Value(nameof(ExecutablePath));
    }
}
