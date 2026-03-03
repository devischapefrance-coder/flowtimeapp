import type { Metadata, Viewport } from "next";
import { Nunito, Fraunces } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FlowTime",
  description: "Votre famille, parfaitement synchronisée",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FlowTime",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F1117",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
      </head>
      <body
        className={`${nunito.variable} ${fraunces.variable}`}
        style={{ fontFamily: "var(--font-nunito), sans-serif" }}
      >
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
