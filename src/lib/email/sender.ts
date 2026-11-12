// Email transport. Resend in staging/production; console logging in dev/tests.
import { Resend } from "resend";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface SendResult {
  id: string | null;
  /** true when no real provider is configured (dev): recorded as "skipped". */
  skipped?: boolean;
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<SendResult>;
}

export class TransientEmailError extends Error {}

export class ResendSender implements EmailSender {
  private client: Resend;
  constructor(
    apiKey: string,
    private from: string,
  ) {
    this.client = new Resend(apiKey);
  }
  async send(email: OutgoingEmail): Promise<SendResult> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
    });
    if (error) {
      const msg = `${error.name}: ${error.message}`;
      // validation errors are permanent; everything else is retried
      if (/validation|invalid/i.test(error.name)) throw new Error(msg);
      throw new TransientEmailError(msg);
    }
    return { id: data?.id ?? null };
  }
}

export class ConsoleSender implements EmailSender {
  public sent: OutgoingEmail[] = [];
  constructor(private quiet = false) {}
  async send(email: OutgoingEmail): Promise<SendResult> {
    this.sent.push(email);
    if (!this.quiet) console.info(`[email:dev] to=${email.to} subject="${email.subject}"\n${email.text}\n`);
    return { id: null, skipped: true };
  }
}

export function getEmailSender(): EmailSender {
  const key = process.env.RESEND_API_KEY;
  if (key) return new ResendSender(key, process.env.EMAIL_FROM ?? "HireLoop <notifications@example.com>");
  return new ConsoleSender();
}
