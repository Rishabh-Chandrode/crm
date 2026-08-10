import nodemailer from 'nodemailer';
import type { EmailProvider, SendEmailOptions, SendEmailResult } from './types.js';
import { CONFIG } from '../../config.js';

const STALE_CONNECTION_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ESOCKET']);

// ─── OAuth2 provider ──────────────────────────────────────────────────────────

export interface GmailCredentials {
  gmailUser: string;
  refreshToken: string;
  fromName: string;
}

export class GmailEmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;
  private readonly credentials: GmailCredentials;

  constructor(credentials: GmailCredentials) {
    this.credentials = credentials;
    this.transporter = this.createTransporter();
  }

  private createTransporter(): nodemailer.Transporter {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      pool: true,
      maxConnections: 3,
      maxMessages: Infinity,
      socketTimeout: 90_000,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      family: 4,
      auth: {
        type: 'OAuth2',
        user: this.credentials.gmailUser,
        clientId: CONFIG.googleClientId,
        clientSecret: CONFIG.googleClientSecret,
        refreshToken: this.credentials.refreshToken,
      },
    } as any);
  }

  private buildMailOptions(options: SendEmailOptions) {
    return {
      from: `${this.credentials.fromName} <${this.credentials.gmailUser}>`,
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

// ─── App Password provider ────────────────────────────────────────────────────

export interface GmailAppPasswordCredentials {
  gmailUser: string;
  appPassword: string;
  fromName: string;
}

export class GmailAppPasswordProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;
  private readonly credentials: GmailAppPasswordCredentials;

  constructor(credentials: GmailAppPasswordCredentials) {
    this.credentials = credentials;
    this.transporter = this.createTransporter();
  }

  private createTransporter(): nodemailer.Transporter {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      pool: true,
      maxConnections: 3,
      maxMessages: Infinity,
      socketTimeout: 90_000,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      family: 4,
      auth: {
        user: this.credentials.gmailUser,
        pass: this.credentials.appPassword,
      },
    } as any);
  }

  private buildMailOptions(options: SendEmailOptions) {
    return {
      from: `${this.credentials.fromName} <${this.credentials.gmailUser}>`,
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

// ─── HTTP REST API provider ───────────────────────────────────────────────────

export class GmailRestApiProvider implements EmailProvider {
  private readonly credentials: GmailCredentials;
  private readonly mailBuilder: nodemailer.Transporter;

  constructor(credentials: GmailCredentials) {
    this.credentials = credentials;
    // Uses streamTransport to compile the raw email (including attachments) to a Buffer
    this.mailBuilder = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
    });
  }

  private buildMailOptions(options: SendEmailOptions) {
    return {
      from: `${this.credentials.fromName} <${this.credentials.gmailUser}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
      attachments: options.attachments,
    };
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const mailOptions = this.buildMailOptions(options);
    const info = await this.mailBuilder.sendMail(mailOptions);
    const rawBuffer = info.message as Buffer;
    const rawBase64Url = rawBuffer.toString('base64url');

    // Fetch fresh access token using the refresh token
    const tokenParams = new URLSearchParams({
      client_id: CONFIG.googleClientId.trim(),
      client_secret: CONFIG.googleClientSecret.trim(),
      refresh_token: (this.credentials.refreshToken || '').trim(),
      grant_type: 'refresh_token',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Failed to refresh Google access token: ${errText}`);
    }

    const tokenData = await tokenRes.json() as { access_token: string };
    const accessToken = tokenData.access_token;

    // Send the raw email via Gmail REST API
    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: rawBase64Url,
      }),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      throw new Error(`Gmail API sending failed: ${errText}`);
    }

    const sendData = await sendRes.json() as { id: string };
    return { id: sendData.id };
  }
}

