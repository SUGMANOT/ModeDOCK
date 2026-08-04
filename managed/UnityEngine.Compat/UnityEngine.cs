using System;
using System.Collections.Generic;
using System.Reflection;

namespace UnityEngine;

public class Object
{
    public static void DontDestroyOnLoad(Object target) { if (target is GameObject gameObject) gameObject.IsPersistent = true; }
}

public class Component : Object { public GameObject? gameObject { get; internal set; } }
public class MonoBehaviour : Component { }

public sealed class GameObject : Object
{
    private readonly List<Component> _components = new();
    public GameObject(string name = "GameObject") => this.name = name;
    public string name { get; }
    public bool IsPersistent { get; internal set; }
    public IReadOnlyList<Component> Components => _components;

    public Component AddComponent(Type componentType)
    {
        if (!typeof(Component).IsAssignableFrom(componentType)) throw new ArgumentException("Type must derive from UnityEngine.Component.", nameof(componentType));
        var component = (Component?)Activator.CreateInstance(componentType, true) ?? throw new InvalidOperationException($"Could not create {componentType.FullName}.");
        component.gameObject = this;
        _components.Add(component);
        componentType.GetMethod("Awake", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)?.Invoke(component, null);
        return component;
    }
}
