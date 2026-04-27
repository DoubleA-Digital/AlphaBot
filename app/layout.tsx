import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import DisclaimerBanner from '@/components/ui/DisclaimerBanner';
import TickerTape from '@/components/TickerTape';

export const metadata: Metadata = {
  title: 'AlphaBot — AI Stock Trading Simulator',
  description: 'AI-powered paper trading simulation platform. Educational use only.',
  openGraph: {
    title: 'AlphaBot',
    description: 'AI-powered paper trading simulation',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[#0a0a0a] text-white">
        <DisclaimerBanner />
        <TickerTape />
        <div className="flex min-h-[calc(100vh-72px)]">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
