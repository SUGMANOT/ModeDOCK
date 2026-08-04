using System;
using UnityEngine;

namespace BepInEx;

[AttributeUsage(AttributeTargets.Class)]
public sealed class BepInPlugin : Attribute
{
    public BepInPlugin(string guid, string name, string version) => (GUID, Name, Version) = (guid, name, version);
    public string GUID { get; }
    public string Name { get; }
    public string Version { get; }
}

[AttributeUsage(AttributeTargets.Class, AllowMultiple = true)]
public sealed class BepInProcess : Attribute
{
    public BepInProcess(string processName) => ProcessName = processName;
    public string ProcessName { get; }
}

public enum DependencyFlags { HardDependency = 1, SoftDependency = 2 }

[AttributeUsage(AttributeTargets.Class, AllowMultiple = true)]
public sealed class BepInDependency : Attribute
{
    public BepInDependency(string dependencyGuid, DependencyFlags flags) => (DependencyGUID, Flags) = (dependencyGuid, flags);
    public string DependencyGUID { get; }
    public DependencyFlags Flags { get; }
}

[AttributeUsage(AttributeTargets.Class, AllowMultiple = true)]
public sealed class BepInIncompatibility : Attribute
{
    public BepInIncompatibility(string incompatibilityGuid) => IncompatibilityGUID = incompatibilityGuid;
    public string IncompatibilityGUID { get; }
}

public class BaseUnityPlugin : MonoBehaviour { }
