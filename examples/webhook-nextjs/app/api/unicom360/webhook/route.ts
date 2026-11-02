// A Next.js App Router route handler (app/api/unicom360/webhook/route.ts) that verifies and
// parses signed Unicom360 webhooks. Read the body with request.text(), never request.json():
// the signature covers the exact bytes.
import { SignatureVerificationError, Webhooks } from "unicom360";

export const runtime = "nodejs"; // the edge runtime works too: verification uses Web Crypto

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  try {
    const event = await Webhooks.constructEvent(
      rawBody,
      request.headers,
      process.env.UNICOM360_WEBHOOK_SECRET ?? "",
    );
    if (event.kind === "message_received") {
      console.log(`${event.data.from ?? "-"} wrote: ${event.data.text ?? "-"}`);
    }
    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof SignatureVerificationError) {
      return new Response(error.reason, { status: 401 });
    }
    throw error;
  }
}
