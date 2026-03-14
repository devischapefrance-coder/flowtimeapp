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
  description: "Votre famille, parfaitement synchronisee",
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
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var at=localStorage.getItem('flowtime_app_theme')||'default';var am=localStorage.getItem('flowtime_theme_mode')||'dark';if(at==='stone-amber'){document.documentElement.classList.add('stone-amber');if(am==='light')document.documentElement.classList.add('light');return}var t=localStorage.getItem('flowtime_theme')||'dark';var m={ocean:'p1',forest:'p2',sunset:'p3',cherry:'p4',lavender:'p5',midnight:'p6',amber:'p7',nord:'p8'};if(m[t]){t=m[t];localStorage.setItem('flowtime_theme',t)}if(t==='system'){t=window.matchMedia('(prefers-color-scheme:light)').matches?'light':'dark'}if(t!=='dark'){document.documentElement.classList.add(t)}}catch(e){}})()`,
          }}
        />
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
