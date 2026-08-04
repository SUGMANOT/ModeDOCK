using System.Text.Json;
using BepInEx;
using BepInEx.Bootstrap;
using BepInEx.Logging;

namespace ModeDOCK.Runtime;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    public static int Main(string[] args)
    {
        if (args.Length < 2 || args[0] != "load-plan") return Error("usage-error", "Usage: ModeDOCK.Runtime.exe load-plan <plan.json>", 2);
        try
        {
            var plan = JsonSerializer.Deserialize<RuntimePlan>(File.ReadAllText(args[1]), new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? throw new InvalidDataException("Runtime plan is empty.");
            Directory.CreateDirectory(plan.Paths.ConfigPath);
            Directory.CreateDirectory(Path.GetDirectoryName(plan.LogPath) ?? ".");
            Paths.Configure(plan.Paths.AsDictionary());
            var listener = new StructuredListener(plan.LogPath);
            Logger.Listeners.Add(listener);
            var loaded = Chainloader.LoadPlugins(plan.Plugins.Select(plugin => new PluginLoadSpec { Location = plugin.Location, TypeName = plugin.TypeName, Guid = plugin.Guid, Name = plugin.Name, Version = plugin.Version }));
            var report = new
            {
                status = loaded.All(plugin => plugin.LoadState == "loaded") ? "ok" : "partial-failure",
                plugins = loaded.Select(plugin => new { guid = plugin.Metadata.GUID, state = plugin.LoadState, error = plugin.LoadError }).ToArray(),
                logs = listener.Events,
                managerPersistent = Chainloader.ManagerObject?.IsPersistent == true
            };
            Console.Out.WriteLine(JsonSerializer.Serialize(report, JsonOptions));
            // A plugin failure is part of the structured result, not a host crash. Other plugins
            // have already been isolated and loaded, so return success after emitting the report.
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return Error("runtime-load-failed", error.Message, 1); }
    }

    private static int Error(string code, string message, int exitCode) { Console.Out.WriteLine(JsonSerializer.Serialize(new { error = new { code, message } }, JsonOptions)); return exitCode; }
}

internal sealed class StructuredListener : ILogListener
{
    private readonly string _file;
    public StructuredListener(string file) => _file = file;
    public List<RuntimeLogEvent> Events { get; } = new();
    public void LogEvent(object sender, LogEventArgs eventArgs)
    {
        var item = new RuntimeLogEvent(DateTimeOffset.UtcNow, eventArgs.Source.SourceName, eventArgs.Level.ToString(), eventArgs.Data?.ToString() ?? "");
        Events.Add(item);
        File.AppendAllText(_file, JsonSerializer.Serialize(item, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }) + Environment.NewLine);
    }
}

internal sealed record RuntimeLogEvent(DateTimeOffset Timestamp, string Source, string Level, string Message);
internal sealed class RuntimePlan { public RuntimePaths Paths { get; set; } = new(); public string LogPath { get; set; } = "runtime.log"; public RuntimePlugin[] Plugins { get; set; } = Array.Empty<RuntimePlugin>(); }
internal sealed class RuntimePlugin { public string Location { get; set; } = ""; public string TypeName { get; set; } = ""; public string Guid { get; set; } = ""; public string Name { get; set; } = ""; public string Version { get; set; } = "0.0.0"; }
internal sealed class RuntimePaths
{
    public string GameRootPath { get; set; } = ""; public string GameDataPath { get; set; } = ""; public string ManagedPath { get; set; } = ""; public string BepInExRootPath { get; set; } = ""; public string PluginPath { get; set; } = ""; public string ConfigPath { get; set; } = ""; public string CachePath { get; set; } = ""; public string ProcessName { get; set; } = ""; public string ExecutablePath { get; set; } = "";
    public IReadOnlyDictionary<string, string> AsDictionary() => GetType().GetProperties().ToDictionary(property => property.Name, property => (string)(property.GetValue(this) ?? ""));
}
