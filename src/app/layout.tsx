import type { Metadata, Viewport } from 'next'
import { THEME_BOOT } from '@/lib/theme'
import { Azeret_Mono, Bodoni_Moda } from 'next/font/google'
import { body as description, site } from '@/lib/content'
import './globals.css'

/**
 * The pairing the whole design rests on: a high-contrast Didone against a
 * squared-off mechanical mono. The serif carries the claims, the mono carries
 * everything a technician would read — labels, codes, readouts, body copy.
 */
const display = Bodoni_Moda({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-display',
  display: 'swap',
})

const mono = Azeret_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

/**
 * Where the site lives, for resolving the social card to an absolute URL.
 *
 * Set NEXT_PUBLIC_SITE_URL once a real domain is attached and it wins.
 * Failing that, Vercel supplies the project's production hostname at build
 * time, so previews and the first deploy get a working card with no
 * configuration at all. Locally it falls back to the dev server.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${site.name} — ${site.mark} field specification`,
  description,
  openGraph: {
    title: `${site.name} — ${site.mark} field specification`,
    description,
    type: 'website',
    url: siteUrl,
    siteName: site.name,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${site.name} — ${site.mark} field specification`,
    description,
  },
}

export const viewport: Viewport = {
  themeColor: '#0e0f0c',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {children}
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  )
}
