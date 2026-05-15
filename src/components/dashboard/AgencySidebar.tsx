"use client";

import * as React from "react";
import {
  LayoutDashboard,
  Map,
  UserCircle,
  LogOut,
  Flame,
  ShieldCheck,
  HeartPulse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "firebase/auth";
import { useAuth as useFirebase } from "@/firebase";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "../ui/button";

interface AgencySidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

const agencyConfig = {
  fire: {
    label: "Fire Agency",
    subtitle: "BFP Command Node",
    icon: Flame,
    color: "text-orange-500",
    activeBg: "bg-orange-950/20 border border-orange-500/10",
    activeIcon: "text-orange-500",
    headerBg: "bg-orange-600/10",
  },
  police: {
    label: "Police Agency",
    subtitle: "PNP Command Node",
    icon: ShieldCheck,
    color: "text-blue-500",
    activeBg: "bg-blue-950/20 border border-blue-500/10",
    activeIcon: "text-blue-500",
    headerBg: "bg-blue-600/10",
  },
  medical: {
    label: "Medical Agency",
    subtitle: "EMS Command Node",
    icon: HeartPulse,
    color: "text-red-500",
    activeBg: "bg-red-950/20 border border-red-500/10",
    activeIcon: "text-red-500",
    headerBg: "bg-red-600/10",
  },
} as const;

export function AgencySidebar({ currentView, onViewChange }: AgencySidebarProps) {
  const auth = useFirebase();
  const router = useRouter();
  const { profile } = useAuth();

  const role = (profile?.role ?? "fire") as keyof typeof agencyConfig;
  const config = agencyConfig[role] ?? agencyConfig.fire;
  const AgencyIcon = config.icon;

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/auth");
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const navItems = [
    { title: "Dashboard", view: "dashboard", icon: LayoutDashboard },
    { title: "Live Map", view: "map", icon: Map, href: "/map" },
    { title: "My Profile", view: "profile", icon: UserCircle },
  ];

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-white/5 bg-[#020617]">
      <SidebarHeader className="p-6 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg overflow-hidden shadow-lg shadow-red-900/30">
            <img src="/icons/logo.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col min-w-0">
            <h2 className="text-sm font-bold text-white leading-tight tracking-tight truncate">{config.label}</h2>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5 uppercase tracking-widest truncate">{config.subtitle}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-4 pt-6">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.href ? (
                    <Link href={item.href}>
                      <SidebarMenuButton className="h-11 px-3 rounded-xl transition-all mb-1 hover:bg-white/5 text-slate-500 hover:text-white w-full">
                        <div className="flex items-center gap-3 w-full">
                          <item.icon className="h-5 w-5 text-slate-500 flex-shrink-0" />
                          <span className="text-sm font-semibold">{item.title}</span>
                        </div>
                      </SidebarMenuButton>
                    </Link>
                  ) : (
                    <SidebarMenuButton
                      onClick={() => onViewChange(item.view)}
                      className={cn(
                        "h-11 px-3 rounded-xl transition-all mb-1",
                        currentView === item.view
                          ? cn("bg-white/5 text-white", config.activeBg)
                          : "text-slate-500 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <item.icon className={cn(
                          "h-5 w-5 flex-shrink-0 transition-colors",
                          currentView === item.view ? config.activeIcon : "text-slate-500"
                        )} />
                        <span className="text-sm font-semibold">{item.title}</span>
                      </div>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-white/5 bg-[#020617] mt-auto">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full h-11 justify-start px-3 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/5 font-semibold transition-all gap-3"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-sm">Logout</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
