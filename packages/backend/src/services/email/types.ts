export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export interface SendEmailResult {
  id: string;
}

export interface EmailProvider {
  send(options: SendEmailOptions): Promise<SendEmailResult>;
}
