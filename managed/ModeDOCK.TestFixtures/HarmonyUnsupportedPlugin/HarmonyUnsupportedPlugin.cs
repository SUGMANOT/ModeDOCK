using BepInEx;
using HarmonyLib;

namespace ModeDOCK.HarmonyUnsupportedPlugin;

[BepInPlugin("com.modedock.harmony-unsupported", "ModeDOCK Unsupported Harmony Fixture", "1.0.0")]
public sealed class UnsupportedPlugin : BaseUnityPlugin
{
    [HarmonyPatch]
    [HarmonyTranspiler]
    public static void UnsupportedTranspiler() { }
}
