import RootProviders from "@/components/general/root-providers";
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <RootProviders />
      </body>
    </html>
  );
}
