// SQS-triggered notifier: renders the day's derived events into a digest and
// sends it via SES. No API keys — IAM only.
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { renderDigest } from "./digest.js";
import { requireEnv } from "./env.js";
import type { SQSEvent } from "./sqs-types.js";

const ses = new SESv2Client({});

export async function handler(event: SQSEvent): Promise<void> {
  const from = requireEnv("EMAIL_FROM");
  const to = requireEnv("EMAIL_TO");

  for (const record of event.Records) {
    const { asOf, events } = JSON.parse(record.body) as {
      asOf: string;
      events: Array<{ type: string; occurredOn: string }>;
    };
    const digest = renderDigest(asOf, events);
    if (digest === null) continue;

    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: digest.subject },
            Body: {
              Text: { Data: digest.text },
              Html: { Data: digest.html },
            },
          },
        },
      }),
    );
    console.log(JSON.stringify({ sent: digest.subject, events: events.length }));
  }
}
