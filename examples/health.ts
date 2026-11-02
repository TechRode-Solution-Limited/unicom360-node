// Gateway liveness. Needs no API key on the wire, but the client still requires one.
import { Unicom360 } from "unicom360";

const client = new Unicom360();

const health = await client.health();
console.log(`${health.status} ${health.version ?? "-"} ${health.timestamp ?? "-"}`);
