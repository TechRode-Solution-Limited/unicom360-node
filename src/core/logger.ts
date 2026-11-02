import { readEnv } from "./env.js";

/**
 * Where the client writes its log lines. Each method takes a message and a small object of
 * fields. Compatible with `console`, pino and winston loggers.
 *
 * The client logs one line per HTTP attempt at debug level (method, path, status,
 * api_reference, attempt, duration_ms) and one line per scheduled retry at info level. It never
 * logs bodies, headers, parameters, phone numbers, addresses, the API key or webhook secrets.
 */
export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

const noop = (): void => undefined;

const silentLogger: Logger = { debug: noop, info: noop, warn: noop, error: noop };

function consoleLogger(level: "debug" | "info"): Logger {
  const write =
    (method: "debug" | "info" | "warn" | "error") =>
    (message: string, fields?: Record<string, unknown>): void => {
      if (fields === undefined) console[method](`[unicom360] ${message}`);
      else console[method](`[unicom360] ${message}`, fields);
    };
  return {
    debug: level === "debug" ? write("debug") : noop,
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
  };
}

/** @internal Silent, unless `UNICOM360_LOG` is `debug` or `info`. */
export function defaultLogger(): Logger {
  const level = readEnv("UNICOM360_LOG")?.trim().toLowerCase();
  if (level === "debug" || level === "info") return consoleLogger(level);
  return silentLogger;
}
