// Units remaining on one bundle.
import { BundleType, Unicom360 } from "unicom360";

const client = new Unicom360();

const sms = await client.balance.get(); // SMS, the gateway's default
const whatsapp = await client.balance.get(BundleType.WHATSAPP);
console.log(`SMS ${sms.balance}, WhatsApp ${whatsapp.balance}`);
