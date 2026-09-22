import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  icons: { icon: "/og.png" },
  metadataBase: new URL(process.env.APP_ORIGIN || "http://127.0.0.1:5180"),
  title: "Mika — Your social, together.",
  description:
    "Mika monitors your channels, uses approved skills and knowledge, and brings important conversations back to you.",
  openGraph: {
    title: "Mika — Your social, together.",
    description: "One calm workspace. Four channels. Your next great idea.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mika — Your social, together.",
    description: "Plan, create and review your social content.",
    images: ["/og.png"],
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
