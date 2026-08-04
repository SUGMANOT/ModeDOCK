using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using BepInEx.Configuration;
using BepInEx.Logging;
using UnityEngine;

namespace BepInEx.Bootstrap;

public sealed class PluginLoadSpec
{
    public string Location { get; set; } = "";
    public string TypeName { get; set; } = "";
    public string Guid { get; set; } = "";
    public string Name { get; set; } = "";
    public string Version { get; set; } = "0.0.0";
}

public static class Chainloader
{
    public static Dictionary<string, PluginInfo> PluginInfos { get; } = new(StringComparer.OrdinalIgnoreCase);
    public static GameObject? ManagerObject { get; private set; }

    public static IReadOnlyList<PluginInfo> LoadPlugins(IEnumerable<PluginLoadSpec> orderedPlugins)
    {
        ManagerObject ??= new GameObject("ModeDOCK Chainloader");
        UnityEngine.Object.DontDestroyOnLoad(ManagerObject);
        var loaded = new List<PluginInfo>();
        foreach (var spec in orderedPlugins)
        {
            var info = new PluginInfo { Location = spec.Location, Metadata = new BepInPlugin(spec.Guid, spec.Name, spec.Version), DependencyState = "resolved" };
            PluginInfos[spec.Guid] = info;
            try
            {
                var assembly = Assembly.LoadFrom(spec.Location);
                var pluginType = assembly.GetType(spec.TypeName, true, false)!;
                if (!typeof(BaseUnityPlugin).IsAssignableFrom(pluginType)) throw new InvalidOperationException($"{spec.TypeName} does not derive from BaseUnityPlugin.");
                var logger = Logger.CreateLogSource(spec.Guid);
                var config = new ConfigFile(Path.Combine(Paths.ConfigPath, spec.Guid + ".cfg"), false);
                PluginConstructionContext.Set(new PluginConstructionContext { Info = info, Logger = logger, Config = config });
                try { info.Instance = (BaseUnityPlugin)ManagerObject.AddComponent(pluginType); }
                finally { PluginConstructionContext.Set(null); }
                info.Instance.Config.Save();
                info.LoadState = "loaded";
            }
            catch (Exception error)
            {
                info.LoadState = "error";
                info.LoadError = error.GetBaseException().Message;
            }
            loaded.Add(info);
        }
        return loaded;
    }
}
