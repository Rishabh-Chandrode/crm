import 'dotenv/config';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

export const CONFIG = {
  port: parseInt(process.env['PORT'] ?? '3001', 10),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: process.env['JWT_SECRET'] ?? 'change-me-in-production',
  jwtExpiresIn: '7d',
  adminUsername: process.env['ADMIN_USERNAME'] ?? 'admin',
  adminPassword: requireEnv('ADMIN_PASSWORD'),
  resendApiKey: process.env['RESEND_API_KEY'] ?? '',
  fromEmail: process.env['FROM_EMAIL'] ?? '',
  fromName: process.env['FROM_NAME'] ?? 'CRM',
  replyToEmail: process.env['REPLY_TO_EMAIL'] ?? '',
  googleClientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
  googleClientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
  googleRedirectUri: process.env['GOOGLE_REDIRECT_URI'] ?? 'http://localhost:3001/api/auth/gmail/callback',
  googleLoginRedirectUri: process.env['GOOGLE_LOGIN_REDIRECT_URI'] ?? 'http://localhost:3001/api/auth/google/callback',
  frontendUrl: process.env['FRONTEND_URL'] ?? 'http://localhost:3000',
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
} as const;
