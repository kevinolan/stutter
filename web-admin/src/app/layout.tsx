import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FluentPath Clinician Admin',
  description: 'Clinician dashboard for the FluentPath speech-fluency platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
