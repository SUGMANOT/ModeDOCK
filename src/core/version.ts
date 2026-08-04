declare const __MODDOCK_VERSION__: string;

export const VERSION = typeof __MODDOCK_VERSION__ === "string" ? __MODDOCK_VERSION__ : "1.0.0b-dev";
