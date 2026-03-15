import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "AutoVC - AI-Powered Venture Funding",
  description:
    "Submit your project, let AI agents review it, and get funded on-chain. Fast, fair, transparent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen" suppressHydrationWarning>
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
