// Units remaining on every bundle.
import { Unicom360 } from "unicom360";

const client = new Unicom360();

const { balances, clientName } = await client.balance.all();
console.log(clientName);
for (const [bundle, units] of Object.entries(balances)) console.log(`${bundle}: ${units}`);
