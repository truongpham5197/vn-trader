import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "./components/Nav";
import { currentUser } from "@/lib/user";
import { Toaster } from "./components/ui";
import { QuotesProvider } from "./components/live";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VN Trading Assistant",
  description: "Scanner + backtest + alerts cho cổ phiếu cơ sở VN",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0e14",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser().catch(() => null);
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0">
        <QuotesProvider>
          <Nav username={user?.username ?? null} />
          {children}
          <Toaster />
        </QuotesProvider>
      </body>
    </html>
  );
}
