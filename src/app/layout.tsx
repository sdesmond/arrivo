import type { Metadata } from "next";
import { Manrope, DM_Sans, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import { DevDatePicker } from "@/components/packt/dev-date-picker";
import { Toaster } from "sonner";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-heading-family",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-family",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Packt — Travel Planner",
  description: "Plan your trips with Packt",
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
