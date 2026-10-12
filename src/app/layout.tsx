import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import { DevDatePicker } from "@/components/packt/dev-date-picker";
import { Toaster } from "sonner";
import "./globals.css";

// Vendored variable fonts (latin subset): the build must not fetch from Google, which content
// filters and offline CI block. Source: @fontsource-variable/*, OFL-licensed.
const manrope = localFont({
  src: "./fonts/manrope-latin-wght-normal.woff2",
  variable: "--font-heading-family",
  weight: "200 800",
  display: "swap",
});

const dmSans = localFont({
  src: "./fonts/dm-sans-latin-wght-normal.woff2",
  variable: "--font-body",
  weight: "100 1000",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-mono-family",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Packt — Travel Planner",
  description: "Plan your trips with Packt",
};

// Without `viewport-fit=cover` every `env(safe-area-inset-*)` resolves to 0px, which silently
// neutralises the notch spacers in the bottom tab bar and the sync status indicator.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const mockISO =
    process.env.NODE_ENV === "development" ? ((await cookies()).get("__packt_mock_date__")?.value ?? null) : null;

  return (
    <html
      lang="en"
      className={`${manrope.variable} ${dmSans.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <MockDateProvider initialISO={mockISO}>
            <TooltipProvider>
              {children}
              <DevDatePicker />
              <Toaster richColors position="bottom-center" />
            </TooltipProvider>
          </MockDateProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
