import 'dotenv/config';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

export const CONFIG = {
  port: parseInt(process.env['PORT'] ?? '3001', 10),
  databaseUrl: requireEnv('DATABASE_URL'),
  adminPassword: requireEnv('ADMIN_PASSWORD'),
  gmailUser: process.env['GMAIL_USER'] ?? '',
  gmailAppPassword: process.env['GMAIL_APP_PASSWORD'] ?? '',
  resendApiKey: process.env['RESEND_API_KEY'] ?? '',
  fromEmail: process.env['FROM_EMAIL'] ?? '',
  fromName: process.env['FROM_NAME'] ?? 'CRM',
  replyToEmail: process.env['REPLY_TO_EMAIL'] ?? '',
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
} as const;
