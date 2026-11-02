// Runtime detection without depending on Node's types, so the SDK runs unchanged on Node,
// Bun, Deno and edge runtimes.

interface ProcessLike {
  env?: Record<string, string | undefined>;
  versions?: { node?: string };
  platform?: string;
  arch?: string;
}

interface DenoLike {
  env?: { get(name: string): string | undefined };
  version?: { deno?: string };
  build?: { os?: string; arch?: string };
}

interface RuntimeGlobals {
  process?: ProcessLike;
  Deno?: DenoLike;
  Bun?: { version?: string };
  EdgeRuntime?: unknown;
  navigator?: { userAgent?: string };
  window?: unknown;
  document?: unknown;
}

const runtime = globalThis as unknown as RuntimeGlobals;

/** @internal Reads an environment variable where the runtime allows it. */
export function readEnv(name: string): string | undefined {
  try {
    const value = runtime.process?.env?.[name];
    if (value !== undefined) return value;
  } catch {
    // Some runtimes throw on env access without permission.
  }
  try {
    return runtime.Deno?.env?.get(name);
  } catch {
    return undefined;
  }
}

/** @internal True in a web browser, where an API key would be exposed to every visitor. */
export function isBrowser(): boolean {
  return typeof runtime.window !== "undefined" && typeof runtime.document !== "undefined";
}

/** @internal `(<runtime> <version>; <os>; <arch>)` for the User-Agent. */
export function runtimeDescription(): string {
  try {
    const deno = runtime.Deno;
    if (deno?.version?.deno !== undefined) {
      return describe("deno", deno.version.deno, deno.build?.os, deno.build?.arch);
    }
    const proc = runtime.process;
    if (runtime.Bun?.version !== undefined) {
      return describe("bun", runtime.Bun.version, proc?.platform, proc?.arch);
    }
    if (proc?.versions?.node !== undefined) {
      return describe("node", proc.versions.node, proc.platform, proc.arch);
    }
    if (typeof runtime.EdgeRuntime === "string")
      return describe("edge-runtime", runtime.EdgeRuntime);
    if (runtime.navigator?.userAgent === "Cloudflare-Workers")
      return describe("workerd", "unknown");
    if (isBrowser()) return describe("browser", "unknown");
  } catch {
    // Fall through to the unknown runtime.
  }
  return describe("unknown", "unknown");
}

function describe(name: string, version: string, os?: string, arch?: string): string {
  return `(${name} ${version}; ${os ?? "unknown"}; ${arch ?? "unknown"})`;
}
