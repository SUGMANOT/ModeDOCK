using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;

namespace BepInEx.Configuration;

public sealed class ConfigDefinition : IEquatable<ConfigDefinition>
{
    public ConfigDefinition(string section, string key) { Section = section; Key = key; }
    public string Section { get; }
    public string Key { get; }
    public bool Equals(ConfigDefinition? other) => other is not null && Section == other.Section && Key == other.Key;
    public override bool Equals(object? obj) => Equals(obj as ConfigDefinition);
    public override int GetHashCode() => (Section + "\0" + Key).GetHashCode();
}

public class AcceptableValueBase { protected AcceptableValueBase(Type valueType) => ValueType = valueType; public Type ValueType { get; } public virtual object Clamp(object value) => value; public virtual bool IsValid(object value) => ValueType.IsInstanceOfType(value); }
public sealed class AcceptableValueRange<T> : AcceptableValueBase where T : IComparable
{
    public AcceptableValueRange(T minValue, T maxValue) : base(typeof(T)) { MinValue = minValue; MaxValue = maxValue; }
    public T MinValue { get; } public T MaxValue { get; }
    public override object Clamp(object value) { var typed = (T)value; return typed.CompareTo(MinValue) < 0 ? MinValue : typed.CompareTo(MaxValue) > 0 ? MaxValue : typed; }
}
public sealed class AcceptableValueList<T> : AcceptableValueBase
{
    public AcceptableValueList(params T[] acceptableValues) : base(typeof(T))
    {
        if (acceptableValues is null || acceptableValues.Length == 0) throw new ArgumentException("At least one acceptable value is required.", nameof(acceptableValues));
        AcceptableValues = acceptableValues;
    }
    public T[] AcceptableValues { get; }
    public override bool IsValid(object value) => value is T typed && AcceptableValues.Contains(typed);
    public override object Clamp(object value) => IsValid(value) ? value : AcceptableValues[0]!;
}
public sealed class ConfigDescription { public ConfigDescription(string description, AcceptableValueBase? acceptableValues = null) { Description = description; AcceptableValues = acceptableValues; } public string Description { get; } public AcceptableValueBase? AcceptableValues { get; } }

public readonly struct KeyboardShortcut
{
    public KeyboardShortcut(string mainKey, params string[] modifiers) { MainKey = mainKey; Modifiers = modifiers ?? Array.Empty<string>(); }
    public string MainKey { get; }
    public IReadOnlyList<string> Modifiers { get; }
    public override string ToString() => string.Join(" + ", Modifiers.Concat(new[] { MainKey }));
    public static KeyboardShortcut Deserialize(string value) { var parts = value.Split('+').Select(item => item.Trim()).Where(item => item.Length > 0).ToArray(); return parts.Length == 0 ? new KeyboardShortcut("") : new KeyboardShortcut(parts[^1], parts.Take(parts.Length - 1).ToArray()); }
}

public sealed class ConfigEntry<T>
{
    private T _value;
    internal ConfigEntry(ConfigFile owner, ConfigDefinition definition, T defaultValue, ConfigDescription description) { Owner = owner; Definition = definition; DefaultValue = defaultValue; Description = description; _value = defaultValue; }
    internal ConfigFile Owner { get; }
    public ConfigDefinition Definition { get; }
    public T DefaultValue { get; }
    public ConfigDescription Description { get; }
    public event EventHandler? SettingChanged;
    public T Value
    {
        get => _value;
        set
        {
            var adjusted = Description.AcceptableValues is null ? value : (T)Description.AcceptableValues.Clamp(value!);
            if (EqualityComparer<T>.Default.Equals(_value, adjusted)) return;
            _value = adjusted; SettingChanged?.Invoke(this, EventArgs.Empty); if (Owner.SaveOnConfigSet) Owner.Save();
        }
    }
    internal void SetWithoutSave(T value) => _value = Description.AcceptableValues is null ? value : (T)Description.AcceptableValues.Clamp(value!);
}

public sealed class ConfigFile
{
    private readonly Dictionary<ConfigDefinition, object> _entries = new();
    private readonly Dictionary<ConfigDefinition, string> _rawValues = new();
    public ConfigFile(string configPath, bool saveOnInit = true) { ConfigFilePath = configPath; SaveOnConfigSet = true; if (File.Exists(configPath)) Reload(); else if (saveOnInit) Save(); }
    public string ConfigFilePath { get; }
    public bool SaveOnConfigSet { get; set; }
    public ConfigEntry<T> Bind<T>(string section, string key, T defaultValue, string description = "") => Bind(section, key, defaultValue, new ConfigDescription(description));
    public ConfigEntry<T> Bind<T>(string section, string key, T defaultValue, ConfigDescription description)
    {
        var definition = new ConfigDefinition(section, key);
        if (_entries.TryGetValue(definition, out var existing)) return (ConfigEntry<T>)existing;
        var entry = new ConfigEntry<T>(this, definition, defaultValue, description); _entries.Add(definition, entry);
        if (_rawValues.TryGetValue(definition, out var raw)) DeserializeInto(entry, raw);
        return entry;
    }
    public void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(ConfigFilePath) ?? ".");
        using var writer = new StreamWriter(ConfigFilePath, false);
        foreach (var group in _entries.OrderBy(item => item.Key.Section).GroupBy(item => item.Key.Section))
        {
            writer.WriteLine($"[{group.Key}]");
            foreach (var pair in group.OrderBy(item => item.Key.Key)) writer.WriteLine($"{pair.Key.Key} = {SerializeValue(pair.Value)}");
            writer.WriteLine();
        }
    }
    public void Reload()
    {
        if (!File.Exists(ConfigFilePath)) return;
        var section = "General";
        foreach (var raw in File.ReadAllLines(ConfigFilePath))
        {
            var line = raw.Trim(); if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal)) continue;
            if (line.StartsWith("[", StringComparison.Ordinal) && line.EndsWith("]", StringComparison.Ordinal)) { section = line.Substring(1, line.Length - 2).Trim(); continue; }
            var split = line.IndexOf('='); if (split < 1) continue;
            var definition = new ConfigDefinition(section, line.Substring(0, split).Trim());
            var value = line.Substring(split + 1).Trim();
            _rawValues[definition] = value;
            if (_entries.TryGetValue(definition, out var entry)) DeserializeInto(entry, value);
        }
    }
    private static string SerializeValue(object entry) { var value = entry.GetType().GetProperty("Value")!.GetValue(entry); return value switch { null => "", IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture), _ => value.ToString() ?? "" }; }
    private static void DeserializeInto(object entry, string value)
    {
        var type = entry.GetType().GetGenericArguments()[0]; object parsed = type == typeof(string) ? value : type == typeof(bool) ? bool.Parse(value) : type == typeof(KeyboardShortcut) ? KeyboardShortcut.Deserialize(value) : type.IsEnum ? Enum.Parse(type, value, true) : Convert.ChangeType(value, type, CultureInfo.InvariantCulture);
        entry.GetType().GetMethod("SetWithoutSave", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!.Invoke(entry, new[] { parsed });
    }
}
