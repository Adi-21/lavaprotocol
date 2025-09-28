import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import Link from 'next/link'
import { WalletConnectButton } from '@/components/WalletConnectButton'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Lava Protocol - Bitcoin Yield Vaults',
  description: 'Optimized and Maximized yield strategies for Bitcoin on Citrea',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <header className="border-b border-black/10 bg-white">
            <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
              <Link href="/" className="text-black font-semibold">Lava Protocol</Link>
              <div className="flex items-center gap-6">
                <nav className="hidden md:flex items-center gap-6 text-sm">
                  <Link href="/" className="text-black hover:text-orange-600">Vault</Link>
                  <Link href="/calculations" className="text-black hover:text-orange-600">Calculations</Link>
                </nav>
                <WalletConnectButton />
              </div>
            </div>
          </header>
          <main>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
