"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutGrid } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function MainSidebar() {
  const pathname = usePathname();

  const navItems = [
    {
      title: "Templates",
      href: "/templates",
      icon: FileText,
    },
    {
      title: "Projects",
      href: "/projects",
      icon: LayoutGrid,
    },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="flex items-center justify-center py-4">
        <h2 className="text-xl font-bold">Code Templator</h2>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href}
                tooltip={item.title}
              >
                <Link href={item.href}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <p className="text-xs text-muted-foreground">© 2025 Bombaclaat</p>
      </SidebarFooter>
    </Sidebar>
  );
}
