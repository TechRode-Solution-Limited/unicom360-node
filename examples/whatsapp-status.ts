// Look up the status of WhatsApp messages by the messageId the sends returned.
import { Unicom360 } from "unicom360";

const client = new Unicom360();

const status = await client.whatsapp.status([
  "7c1f3a2e-5b64-4d2f-9a8e-0f1b2c3d4e5f",
  "00000000-0000-4000-8000-000000000000",
]);

for (const s of status.results) {
  const error = s.error === null ? "" : ` (${s.error.message})`;
  console.log(`${s.messageId}: ${s.status}${error}`);
}
