import { isObject, num, setRaw, str, type JsonObject } from "../core/json.js";
import type { OpenEnum } from "./common.js";

/** The bundle types `balance.get()` accepts. Any other string reports 0. */
export const BundleType = {
  SMS: "SMS",
  SMS_INTERNATIONAL: "SMS_INTERNATIONAL",
  EMAIL: "EMAIL",
  WHATSAPP: "WHATSAPP",
} as const;

/** A bundle type: one of {@link BundleType}, or any string the gateway adds. */
export type BundleTypeValue = OpenEnum<(typeof BundleType)[keyof typeof BundleType]>;

/**
 * The answer to `client.balance.get()`: units remaining on one bundle. Treat `balance` as a
 * decimal: the WhatsApp bundle can hold fractions of a unit.
 */
export class Balance {
  /** The gateway's message. */
  readonly message: string | null;
  /** Units remaining. */
  readonly balance: number;
  /** The bundle this balance is for. */
  readonly bundleType: BundleTypeValue;
  /** Your client id. */
  readonly clientId: string | null;
  /** Your client name. */
  readonly clientName: string | null;
  /** The response body this balance was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.message = str(raw.message);
    this.balance = num(raw.balance) ?? 0;
    this.bundleType = str(raw.bundle_type) ?? "";
    this.clientId = str(raw.client_id);
    this.clientName = str(raw.client_name);
  }
}

/** The answer to `client.balance.all()`: units remaining on every bundle. */
export class Balances {
  /** The gateway's message. */
  readonly message: string | null;
  /** Units remaining per bundle type (`SMS`, `EMAIL`, `WHATSAPP`, ...). */
  readonly balances: Readonly<Record<string, number>>;
  /** Your client id. */
  readonly clientId: string | null;
  /** Your client name. */
  readonly clientName: string | null;
  /** The response body these balances were parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.message = str(raw.message);
    const balances: Record<string, number> = {};
    if (isObject(raw.balances)) {
      for (const [bundle, value] of Object.entries(raw.balances)) {
        const units = num(value);
        if (units !== null) balances[bundle] = units;
      }
    }
    this.balances = balances;
    this.clientId = str(raw.client_id);
    this.clientName = str(raw.client_name);
  }
}

/** The answer to `client.health()`. */
export class Health {
  /** `ok` when the gateway is up. */
  readonly status: string;
  /** The gateway's clock (ISO 8601, as received). */
  readonly timestamp: string | null;
  /** The gateway's version. */
  readonly version: string | null;
  /** The gateway's environment, for example `production`. */
  readonly environment: string | null;
  /** The response body this answer was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.status = str(raw.status) ?? "";
    this.timestamp = str(raw.timestamp);
    this.version = str(raw.version);
    this.environment = str(raw.environment);
  }
}
