import nodemailer from 'nodemailer';
import type { EmailProvider, SendEmailOptions, SendEmailResult } from './types.js';
import { CONFIG } from '../../config.js';
import { exchangeGmailRefreshToken, type GmailTokenUpdate } from './gmailToken.js';

const STALE_CONNECTION_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ESOCKET']);

// ─── OAuth2 provider ──────────────────────────────────────────────────────────

export interface GmailCredentials {
  gmailUser: string;
  refreshToken: string;
  fromName: string;
  accessToken?: string;
  onTokenRefreshed?: (token: GmailTokenUpdate) => Promise<void>;
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

  private async refreshAccessToken(): Promise<string> {
    const fresh = await exchangeGmailRefreshToken(this.credentials.refreshToken);
    this.credentials.refreshToken = fresh.refreshToken;
    this.credentials.accessToken = fresh.accessToken;
    await this.credentials.onTokenRefreshed?.(fresh);
    return fresh.accessToken;
  }

  private async postRaw(accessToken: string, rawBase64Url: string): Promise<{ id: string; threadId?: string }> {
    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawBase64Url }),
    });

    if (sendRes.status === 401) {
      const err = new Error('Gmail access token rejected') as Error & { status: number };
      err.status = 401;
      throw err;
    }

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      throw new Error(`Gmail API sending failed: ${errText}`);
    }

    return sendRes.json() as Promise<{ id: string; threadId?: string }>;
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const mailOptions = this.buildMailOptions(options);
    const info = await this.mailBuilder.sendMail(mailOptions);
    const rawBuffer = info.message as Buffer;
    const rawBase64Url = rawBuffer.toString('base64url');

    let accessToken = this.credentials.accessToken ?? await this.refreshAccessToken();
    try {
      const sendData = await this.postRaw(accessToken, rawBase64Url);
      return { id: sendData.threadId || sendData.id };
    } catch (err) {
      if ((err as { status?: number }).status !== 401) throw err;
      accessToken = await this.refreshAccessToken();
      const sendData = await this.postRaw(accessToken, rawBase64Url);
      return { id: sendData.threadId || sendData.id };
    }
  }
}

