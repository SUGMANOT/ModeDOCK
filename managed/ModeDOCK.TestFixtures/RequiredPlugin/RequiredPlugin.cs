using BepInEx;

namespace ModeDOCK.RequiredPlugin;

[BepInPlugin("com.modedock.required", "ModeDOCK Required Fixture", "1.0.0")]
[BepInProcess("ModeDOCK.SampleUnityMonoGame.exe")]
public sealed class RequiredPlugin : BaseUnityPlugin
{
    private void Awake() => Logger.LogInfo("Required fixture loaded");
}
