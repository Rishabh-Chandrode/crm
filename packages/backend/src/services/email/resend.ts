import { Resend } from 'resend';
import type { EmailProvider, SendEmailOptions, SendEmailResult } from './types.js';
import { CONFIG } from '../../config.js';

export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;

  constructor() {
    this.client = new Resend(CONFIG.resendApiKey);
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const { data, error } = await this.client.emails.send({
      from: `${CONFIG.fromName} <${CONFIG.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo ?? CONFIG.replyToEmail ?? undefined,
    });

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to send email via Resend');
    }

    return { id: data.id };
  }
}
