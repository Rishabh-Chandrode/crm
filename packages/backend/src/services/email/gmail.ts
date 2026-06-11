import nodemailer from 'nodemailer';
import type { EmailProvider, SendEmailOptions, SendEmailResult } from './types.js';
import { CONFIG } from '../../config.js';

export class GmailEmailProvider implements EmailProvider {
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 3,
      maxMessages: Infinity,
      auth: {
        user: CONFIG.gmailUser,
        pass: CONFIG.gmailAppPassword,
      },
    });
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const info = await this.transporter.sendMail({
      from: `${CONFIG.fromName} <${CONFIG.gmailUser}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
    });

    return { id: info.messageId as string };
  }
}
