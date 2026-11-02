// Send one SMS to two numbers and report each recipient.
//   UNICOM360_API_KEY=... npx tsx examples/sms-send.ts
import { APIError, Unicom360 } from "unicom360";

const client = new Unicom360();

try {
  const result = await client.sms.send({
    from: "Unicom360",
    to: ["260971234567", "260961234567"],
    message: "Your order ZM4821 is ready for collection.",
    // A reference makes the send safe to retry after a timeout: the gateway refuses a repeat.
    userReferenceId: "order-ZM4821",
  });
  console.log(`api_reference ${result.apiReference ?? "-"}`);
  for (const r of result.accepted())
    console.log(`queued ${r.mobileNumber ?? "-"} as ${r.messageId}`);
  for (const r of result.invalid())
    console.log(`not sent to ${r.mobileNumber ?? "-"}: ${r.status}`);
  // Results are not in request order past the tenth recipient: look numbers up instead.
  console.log(result.byNumber("+260 97 123 4567")?.messageId);
} catch (error) {
  if (error instanceof APIError) console.error(`refused: ${error.code} (${error.message})`);
  else throw error;
}
