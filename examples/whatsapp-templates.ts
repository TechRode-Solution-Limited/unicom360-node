// List your approved WhatsApp templates and their variables.
import { Unicom360 } from "unicom360";

const client = new Unicom360();

const list = await client.whatsapp.templates();
for (const t of list.templates) {
  const variables = t.body?.variables.join(", ") ?? "";
  console.log(`${t.name} (${t.language}, ${t.category ?? "-"}): ${variables}`);
}
console.log(list.byName("order_ready", "en_US")?.body?.text);
