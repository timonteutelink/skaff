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
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

export function MainSidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

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
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex items-center justify-center py-6">
        {!isCollapsed && <h2 className="text-xl font-bold">Code Templator</h2>}
        <SidebarTrigger
          className={isCollapsed ? "mx-auto" : "absolute right-2 top-4"}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem
              key={item.href}
              className={isCollapsed ? "flex justify-center" : ""}
            >
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href}
                tooltip={item.title}
                className={isCollapsed ? "w-full flex justify-center" : ""}
              >
                <Link
                  href={item.href}
                  className={
                    isCollapsed ? "flex justify-center items-center w-full" : ""
                  }
                >
                  <item.icon className="h-5 w-5" />
                  {!isCollapsed && <span className="ml-2">{item.title}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      {!isCollapsed && (
        <SidebarFooter className="p-4">
          <p className="text-xs text-muted-foreground">© 2025 Bombaclaat</p>
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}
