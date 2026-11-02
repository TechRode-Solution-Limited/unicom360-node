// Send an approved WhatsApp template with an image header, body variables and a url button.
import { TemplateBody, TemplateButton, TemplateHeader, Unicom360 } from "unicom360";

const client = new Unicom360();

const result = await client.whatsapp.sendTemplate({
  template: "order_ready",
  language: "en_US",
  recipients: [
    {
      to: "260971234567",
      userReferenceId: "inv-42",
      header: TemplateHeader.image("https://example.com/receipts/ZM-4821.png"),
      body: TemplateBody.of(["Ada", "ZM-4821"]),
      buttons: [TemplateButton.url(0, "ZM-4821")],
    },
    {
      to: "260961234567",
      userReferenceId: "inv-43",
      body: TemplateBody.named({ name: "Joseph", order: "ZM-4822" }),
    },
  ],
});

console.log(`${result.acceptedCount} accepted, ${result.rejectedCount} rejected`);
for (const r of result.rejected()) console.log(`rejected ${r.to ?? "-"}: ${r.reason ?? "-"}`);
