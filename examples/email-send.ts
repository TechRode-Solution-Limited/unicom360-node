// Send an HTML email.
import { Unicom360 } from "unicom360";

const client = new Unicom360();

const result = await client.email.send({
  from: "noreply@yourdomain.com",
  to: ["jane@example.com", "john@example.com"],
  subject: "Your order is confirmed",
  emailBody: "<p>Thanks for your order. Order ZM4821 is confirmed.</p>",
  replyTo: "support@yourdomain.com",
  callbackUrl: "https://example.com/webhooks/unicom360/email",
});

for (const r of result.results)
  console.log(`${r.emailAddress ?? "-"}: ${r.status} (${r.messageId})`);
console.log(result.byAddress("JANE@example.com")?.messageId);
