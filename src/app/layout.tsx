import type { Metadata } from 'next';
import './globals.css';
import SupabaseProvider from '@/components/SupabaseProvider';

export const metadata: Metadata = {
  title: 'Kids Tests Admin',
  description: 'Платформа тестирования детей',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="bg-[#030712] text-white">
        <SupabaseProvider>{children}</SupabaseProvider>
      </body>
    </html>
  );
}
