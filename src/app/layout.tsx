import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.scss";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { CookieConsent } from "@/components/shared/CookieConsent";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#2243B6",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "Free Coverage Analysis — Upload Your Policy | CoverageCheckNow",
    template: "%s | CoverageCheckNow",
  },
  description: "Comprehensive policy analysis, replacement cost estimation (RCE), coverage gap detection, and automated CoPilot outreach for property insurance policies.",
  applicationName: "CoverageCheckNow",
  authors: [{ name: "Alsop and Associates Insurance Agency" }],
  keywords: [
    "Property Insurance",
    "DIC insurance",
    "Difference in Conditions",
    "Insurance Policy Review",
    "RCE Verification",
    "Coverage Gap Detection",
    "Alsop and Associates",
    "Allstate CoPilot",
    "Homeowners Insurance California",
    "Property Insurance Intelligence",
  ],
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` :
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://coveragechecknow.com"))
  ),
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "CoverageCheckNow — Policy Analysis & Coverage Review",
    description: "Automatic dec page ingestion, RCE verification, coverage gap detection, and Allstate CoPilot prompt generation for Alsop and Associates.",
    url: "/",
    siteName: "CoverageCheckNow",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "CoverageCheckNow — Policy Analysis & Coverage Review",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CoverageCheckNow — Policy Analysis & Coverage Review",
    description: "Comprehensive policy analysis, coverage gap detection, and automated outreach for property insurance agencies.",
    images: ["/twitter-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "InsuranceAgency",
      "@id": "https://coveragechecknow.com/#agency",
      "name": "Alsop and Associates Insurance Agency",
      "url": "https://coveragechecknow.com",
      "logo": "https://coveragechecknow.com/icon.png",
      "description": "Property policy review, companion coverage analysis, and replacement cost estimation for homeowners.",
      "areaServed": "California",
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://coveragechecknow.com/#software",
      "name": "CoverageCheckNow",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "description": "AI-supported policy analysis, flag detection, and coverage review platform for property insurance agents and homeowners.",
    },
  ],
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is CoverageCheckNow free?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. CoverageCheckNow is completely free to use. There are no hidden fees."
      }
    },
    {
      "@type": "Question",
      "name": "What do you need from me?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Just your insurance declarations page — the summary page from your policy documents. It's usually 1–3 pages."
      }
    },
    {
      "@type": "Question",
      "name": "Do I need an account?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, a free account is required so your documents and reports stay secure and accessible only to you."
      }
    },
    {
      "@type": "Question",
      "name": "How long does the analysis take?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Most reports are generated within minutes of uploading your declarations page."
      }
    },
    {
      "@type": "Question",
      "name": "Is my data safe?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. We use encryption, least-privilege access, and never sell your personal data."
      }
    },
    {
      "@type": "Question",
      "name": "What file types are supported?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We accept PDF files up to 10MB."
      }
    },
    {
      "@type": "Question",
      "name": "Does this replace my insurance agent?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. CoverageCheckNow helps you and your agent make more informed decisions. We recommend reviewing results with a licensed professional."
      }
    },
    {
      "@type": "Question",
      "name": "What states are supported?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We are currently focused on California."
      }
    }
  ]
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider>
          {children}
          <CookieConsent />
        </ThemeProvider>
      </body>
    </html>
  );
}
