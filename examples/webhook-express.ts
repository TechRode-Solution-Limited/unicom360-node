// Receive Unicom360 webhooks with Express.
//
// WhatsApp events are signed: verify them against the raw body, so register express.raw()
// (not express.json()) on the route. SMS and email delivery reports are unsigned and never
// retried, so treat them as hints.
import express from "express";
import { SignatureVerificationError, Webhooks } from "unicom360";

const secret = process.env.UNICOM360_WEBHOOK_SECRET ?? "";
const seen = new Set<string>();
const app = express();

app.post("/webhooks/unicom360/whatsapp", express.raw({ type: "application/json" }), (req, res) => {
  Webhooks.constructEvent(req.body as Buffer, req.headers, secret)
    .then((event) => {
      // Deliveries are retried on any non-2xx answer: drop repeats by deliveryId.
      if (event.deliveryId !== null && seen.has(event.deliveryId)) return res.sendStatus(200);
      if (event.deliveryId !== null) seen.add(event.deliveryId);
      switch (event.kind) {
        case "message_status":
          console.log(`message ${event.data.messageId} is ${event.data.status}`);
          break;
        case "message_received":
          console.log(`${event.data.from ?? "-"} wrote: ${event.data.text ?? "-"}`);
          break;
        case "test":
          console.log("test event received");
          break;
        case "unknown":
          console.log(`unhandled event ${event.event}`);
          break;
      }
      return res.sendStatus(200);
    })
    .catch((error: unknown) => {
      if (error instanceof SignatureVerificationError) {
        console.warn(`rejected webhook: ${error.reason}`);
        return res.sendStatus(401);
      }
      console.error(error);
      return res.sendStatus(500);
    });
});

app.post("/webhooks/unicom360/sms", express.raw({ type: "*/*" }), (req, res) => {
  const report = Webhooks.parseSmsCallback(req.body as Buffer);
  console.log(`SMS ${report.messageId} to ${report.mobileNumber ?? "-"}: ${report.status}`);
  res.sendStatus(200);
});

app.post("/webhooks/unicom360/email", express.raw({ type: "*/*" }), (req, res) => {
  const report = Webhooks.parseEmailCallback(req.body as Buffer);
  console.log(`email ${report.messageId} to ${report.emailAddress ?? "-"}: ${report.status}`);
  res.sendStatus(200);
});

app.listen(3000);
