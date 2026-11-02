// Session messages, inside the customer's 24-hour window: text, an image, reply buttons, a
// list, a location and a reaction.
import { Session, SessionWindowClosedError, Unicom360 } from "unicom360";

const client = new Unicom360();
const to = "260971234567";

const messages = [
  Session.text(to, "Hi Ada, your order ZM-4821 is ready.", { userReferenceId: "s-1" }),
  Session.image(to, "https://example.com/receipts/ZM-4821.png", { caption: "Your receipt" }),
  Session.buttons(to, "Collect today or deliver?", [
    { id: "collect", title: "Collect" },
    { id: "deliver", title: "Deliver" },
  ]),
  Session.list(to, "Choose a delivery slot", "Pick a slot", [
    { title: "Today", rows: [{ id: "today-am", title: "Morning", description: "08:00 to 12:00" }] },
  ]),
  Session.location(to, -15.4167, 28.2833, { name: "Cairo Road branch" }),
  Session.reaction(
    to,
    "wamid.HBgMMjYwOTcxMjM0NTY3FQIAEhggQTVCMEM3Qjc5OUZCOEU5NEM3REMxMjI5NzJBODJEQTVEAA==",
    "👍",
  ),
];

for (const message of messages) {
  try {
    const sent = await client.whatsapp.sendSession(message);
    console.log(`${message.type}: ${sent.messageId}`);
  } catch (error) {
    if (error instanceof SessionWindowClosedError) {
      console.error("The 24-hour window is closed: send a template instead.");
      break;
    }
    throw error;
  }
}
