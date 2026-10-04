"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, TrendingUp, CandlestickChart, BookOpen, BarChart3, Shield, Settings, LogOut, WalletCards } from "lucide-react";
import { signOut } from "next-auth/react";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/dashboard/challenges", icon: WalletCards, label: "Funded Accounts" },
  { href: "/dashboard/trading", icon: CandlestickChart, label: "Trading" },
  { href: "/dashboard/trades", icon: TrendingUp, label: "Trades" },
  { href: "/dashboard/journal", icon: BookOpen, label: "Journal" },
  { href: "/dashboard/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/dashboard/risk", icon: Shield, label: "Risk" },
];

export function Sidebar() {
  const pathname = usePathname();
  return <aside className="w-16 flex flex-col items-center py-4 bg-surface border-r border-border gap-2">
    <Link href="/dashboard" className="w-8 h-8 rounded-lg bg-crimson/20 border border-crimson/40 flex items-center justify-center mb-4" title="NGFunded"><span className="text-xs font-bold text-crimson">NG</span></Link>
    <nav className="flex flex-col items-center gap-1 flex-1">{navItems.map(({ href, icon: Icon, label }) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} title={label} className={cn("w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 group relative", active ? "bg-crimson/15 text-crimson shadow-glow-crimson" : "text-text-muted hover:text-text-secondary hover:bg-surface-elevated")}><Icon className="w-5 h-5"/><span className="absolute left-14 bg-surface-elevated text-text-primary text-xs px-2 py-1 rounded border border-border whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">{label}</span></Link>; })}</nav>
    <div className="flex flex-col items-center gap-1"><Link href="/dashboard/settings" title="Settings" className="w-10 h-10 rounded-lg flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-surface-elevated transition-all"><Settings className="w-5 h-5"/></Link><button onClick={() => signOut({ callbackUrl: "/auth/login" })} title="Sign Out" className="w-10 h-10 rounded-lg flex items-center justify-center text-text-muted hover:text-crimson hover:bg-crimson/10 transition-all"><LogOut className="w-5 h-5"/></button></div>
  </aside>;
}
