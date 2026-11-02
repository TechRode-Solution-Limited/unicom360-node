# Examples

One script per operation, plus webhook receivers. They import `unicom360` as an application
would; CI type-checks them against the source (`npm run typecheck`).

Every send costs money: there is no sandbox. Run one with a real key only when you mean it:

```sh
UNICOM360_API_KEY=... npx tsx examples/balance-all.ts
```

| File                                                | Shows                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `sms-send.ts`                                       | `client.sms.send`, result helpers, error handling                   |
| `email-send.ts`                                     | `client.email.send`                                                 |
| `whatsapp-send-template.ts`                         | `client.whatsapp.sendTemplate` with the template factories          |
| `whatsapp-send-session.ts`                          | `client.whatsapp.sendSession` with the `Session` builders           |
| `whatsapp-status.ts`                                | `client.whatsapp.status`                                            |
| `whatsapp-templates.ts`                             | `client.whatsapp.templates`                                         |
| `balance-get.ts`                                    | `client.balance.get`                                                |
| `balance-all.ts`                                    | `client.balance.all`                                                |
| `health.ts`                                         | `client.health`                                                     |
| `webhook-express.ts`                                | Signed webhooks and unsigned callbacks with Express (`express.raw`) |
| `webhook-nextjs/app/api/unicom360/webhook/route.ts` | Signed webhooks in a Next.js route handler                          |
