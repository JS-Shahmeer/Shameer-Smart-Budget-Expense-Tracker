import {
  ArrowLeftRight,
  BarChart3,
  CalendarClock,
  Calculator,
  FileText,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile?: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, mobile: true },
  { href: "/budgets", label: "Budgets", icon: Wallet, mobile: true },
  { href: "/savings", label: "Savings goals", icon: PiggyBank },
  { href: "/planner", label: "Planner", icon: Calculator, mobile: true },
  { href: "/recurring", label: "Recurring & bills", icon: CalendarClock },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/accounts", label: "Accounts & categories", icon: Landmark },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
