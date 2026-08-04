using BepInEx;
using BepInEx.Configuration;
using System.Globalization;
using UnityEngine;

namespace ModeDOCK.SyntheticPlugin;

[BepInPlugin("com.modedock.synthetic", "ModeDOCK Synthetic Plugin", "1.2.3")]
[BepInProcess("ModeDOCK.SampleUnityMonoGame.exe")]
[BepInDependency("com.modedock.required", BepInDependency.DependencyFlags.HardDependency)]
[BepInDependency("com.modedock.optional", BepInDependency.DependencyFlags.SoftDependency)]
[BepInIncompatibility("com.modedock.incompatible")]
public sealed class FixturePlugin : BaseUnityPlugin
{
    private enum FixtureMode { Safe, Fast }

    public GameObject? Marker { get; set; }

    private void Awake()
    {
        var enabled = Config.Bind("General", "Enabled", true, "Synthetic fixture setting");
        var count = Config.Bind("General", "Count", 3, new ConfigDescription("Bounded integer", new AcceptableValueRange<int>(1, 5)));
        var ratio = Config.Bind("General", "Ratio", 1.5d, "Floating-point value");
        var mode = Config.Bind("General", "Mode", FixtureMode.Safe, new ConfigDescription("Enum value", new AcceptableValueList<FixtureMode>(FixtureMode.Safe, FixtureMode.Fast)));
        var label = Config.Bind("General", "Label", "fixture", "String value");
        var shortcut = Config.Bind("Input", "Shortcut", new KeyboardShortcut("F8", "Ctrl"), "Keyboard shortcut");
        Marker = enabled.Value ? new GameObject("Synthetic Marker") : null;
        Logger.LogInfo($"Synthetic Awake; root={Paths.GameRootPath}; enabled={enabled.Value}; count={count.Value}; ratio={ratio.Value.ToString(CultureInfo.InvariantCulture)}; mode={mode.Value}; label={label.Value}; shortcut={shortcut.Value}");
    }
}
