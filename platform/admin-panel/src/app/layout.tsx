import type { Metadata } from 'next'
import './globals.css'
import Layout from '@/components/Layout'

export const metadata: Metadata = {
  title: 'LaunchSecure - Compliance Automation Platform',
  description: 'Automated compliance scanning with Steampipe/Powerpipe',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Layout>{children}</Layout>
      </body>
    </html>
  )
}

