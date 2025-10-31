import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import React from "react";

export const metadata: Metadata = {
  title: 'Solana Options Marketplace',
  description: 'Trade options on Solana with atomic swaps',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning={true}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
