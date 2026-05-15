
"use client";

import * as React from "react";
import { 
  LayoutDashboard, 
  Bell, 
  Users, 
  ClipboardList, 
  Map, 
  UserCircle,
  TriangleAlert,
  LogOut,
  Settings,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from 'firebase/auth';
import { useAuth as useFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "../ui/button";

interface AdminSidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

export function AdminSidebar({ currentView, onViewChange }: AdminSidebarProps) {
  const auth = useFirebase();
  const router = useRouter();
  
  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/auth');
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const navItems = {
    main: [
      { title: "Dashboard", view: "overview", icon: LayoutDashboard },
      { title: "Manage Alerts", view: "alerts", icon: Bell },
      { title: "Manage Users", view: "users", icon: Users },
    ],
    reports: [
      { title: "Alert History", view: "history", icon: ClipboardList },
      { title: "Live Map", view: "map", icon: Map, href: "/map" },
      { title: "Feedback & Ratings", view: "feedback", icon: Star },
      { title: "My Profile", view: "profile", icon: UserCircle },
      { title: "Settings", view: "settings", icon: Settings },
    ],
  };

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-white/5 bg-[#020617]">
    <SidebarHeader className="p-6 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg overflow-hidden shadow-lg shadow-red-900/40">
            <img src="/icons/logo.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col min-w-0">
            <h2 className="text-sm font-bold text-white leading-tight tracking-tight truncate">Emergency Hotline</h2>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5 uppercase tracking-widest truncate">Admin Panel</p>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-4 pt-6">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.main.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    onClick={() => onViewChange(item.view)}
                    className={cn(
                      "h-11 px-3 rounded-xl transition-all mb-1",
                      currentView === item.view 
                        ? "bg-white/5 text-white" 
                        : "text-slate-500 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <item.icon className={cn(
                        "h-5 w-5 flex-shrink-0 transition-colors",
                        currentView === item.view ? "text-red-500" : "text-slate-500"
                      )} />
                      <span className="text-sm font-semibold">{item.title}</span>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <SidebarGroup className="mt-6">
          <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2 px-3">Reports</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.reports.map((item) => (
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
                          ? "bg-white/5 text-white" 
                          : "text-slate-500 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <item.icon className={cn(
                          "h-5 w-5 flex-shrink-0 transition-colors",
                          currentView === item.view ? "text-red-500" : "text-slate-500"
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
