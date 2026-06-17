import nodemailer from 'nodemailer';
import type { EmailProvider, SendEmailOptions, SendEmailResult } from './types.js';
import { CONFIG } from '../../config.js';

const STALE_CONNECTION_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ESOCKET']);

export class GmailEmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = this.createTransporter();
  }

  private createTransporter(): nodemailer.Transporter {
    return nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 3,
      maxMessages: Infinity,
      // Close idle pool connections after 90 s — before Gmail drops them (~2 min)
      socketTimeout: 90_000,
      auth: {
        user: CONFIG.gmailUser,
        pass: CONFIG.gmailAppPassword,
      },
    });
  }

  private buildMailOptions(options: SendEmailOptions) {
    return {
      from: `${CONFIG.fromName} <${CONFIG.gmailUser}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
      attachments: options.attachments,
    };
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    try {
      const info = await this.transporter.sendMail(this.buildMailOptions(options));
      return { id: info.messageId as string };
    } catch (err) {
      // Stale pool connection — close it, get a fresh one, retry once
      if (STALE_CONNECTION_CODES.has((err as { code?: string }).code ?? '')) {
        this.transporter.close();
        this.transporter = this.createTransporter();
        const info = await this.transporter.sendMail(this.buildMailOptions(options));
        return { id: info.messageId as string };
      }
      throw err;
    }
  }
}
