using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;

namespace ModeDOCK.SampleUnityMonoGame;

internal static class Program
{
    private static int Main()
    {
        var plan = Environment.GetEnvironmentVariable("MODDOCK_RUNTIME_PLAN");
        var runtime = Environment.GetEnvironmentVariable("MODDOCK_RUNTIME_EXE");
        if (string.IsNullOrWhiteSpace(plan) || string.IsNullOrWhiteSpace(runtime))
        {
            Console.WriteLine(JsonSerializer.Serialize(new { status = "no-runtime", fixture = "modedock.controlled-unity-mono.v1" }));
            return 0;
        }
        if (!File.Exists(plan) || !File.Exists(runtime)) { Console.Error.WriteLine("ModeDOCK launch-time runtime files are missing."); return 2; }
        using var child = Process.Start(new ProcessStartInfo(runtime, $"load-plan \"{plan}\"") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true })!;
        var stdout = child.StandardOutput.ReadToEnd(); var stderr = child.StandardError.ReadToEnd();
        if (!child.WaitForExit(20_000)) { child.Kill(true); Console.Error.WriteLine("ModeDOCK runtime timed out."); return 3; }
        Console.Out.Write(stdout); Console.Error.Write(stderr); return child.ExitCode;
    }
}
