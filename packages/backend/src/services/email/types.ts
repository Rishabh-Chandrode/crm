export interface Attachment {
  filename: string;
  path?: string;
  content?: Buffer | string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: Attachment[];
}

export interface SendEmailResult {
  id: string;
}

export interface EmailProvider {
  send(options: SendEmailOptions): Promise<SendEmailResult>;
}
