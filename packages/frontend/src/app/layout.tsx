import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CRM',
  description: 'Personal CRM for job outreach',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
