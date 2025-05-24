"use client";

import { MainSidebar } from "@/components/general/main-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function SidebarLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SidebarProvider>
      <MainSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
