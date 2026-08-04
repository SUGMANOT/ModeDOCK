using System;
using System.Collections.Generic;

namespace BepInEx.Logging;

[Flags]
public enum LogLevel { None = 0, Fatal = 1, Error = 2, Warning = 4, Message = 8, Info = 16, Debug = 32, All = Fatal | Error | Warning | Message | Info | Debug }
public interface ILogSource { string SourceName { get; } event EventHandler<LogEventArgs>? LogEvent; }
public interface ILogListener { void LogEvent(object sender, LogEventArgs eventArgs); }
public sealed class LogEventArgs : EventArgs
{
    public LogEventArgs(object data, LogLevel level, ILogSource source) { Data = data; Level = level; Source = source; }
    public object Data { get; }
    public LogLevel Level { get; }
    public ILogSource Source { get; }
}

public sealed class ManualLogSource : ILogSource
{
    internal ManualLogSource(string sourceName) => SourceName = sourceName;
    public string SourceName { get; }
    public event EventHandler<LogEventArgs>? LogEvent;
    public void Log(LogLevel level, object data) => LogEvent?.Invoke(this, new LogEventArgs(data, level, this));
    public void LogDebug(object data) => Log(LogLevel.Debug, data);
    public void LogInfo(object data) => Log(LogLevel.Info, data);
    public void LogMessage(object data) => Log(LogLevel.Message, data);
    public void LogWarning(object data) => Log(LogLevel.Warning, data);
    public void LogError(object data) => Log(LogLevel.Error, data);
    public void LogFatal(object data) => Log(LogLevel.Fatal, data);
}

public static class Logger
{
    private static readonly List<ILogSource> SourceList = new();
    private static readonly List<ILogListener> ListenerList = new();
    public static ICollection<ILogSource> Sources => SourceList;
    public static ICollection<ILogListener> Listeners => ListenerList;
    public static ManualLogSource CreateLogSource(string sourceName)
    {
        var source = new ManualLogSource(sourceName);
        source.LogEvent += (_, args) => { foreach (var listener in ListenerList.ToArray()) listener.LogEvent(source, args); };
        SourceList.Add(source);
        return source;
    }
}
