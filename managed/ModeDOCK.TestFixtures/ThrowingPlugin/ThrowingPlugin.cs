using System;
using BepInEx;

namespace ModeDOCK.ThrowingPlugin;

[BepInPlugin("com.modedock.throwing", "ModeDOCK Throwing Plugin", "1.0.0")]
public sealed class ThrowingPlugin : BaseUnityPlugin
{
    private void Awake() => throw new InvalidOperationException("Synthetic Awake failure");
}
