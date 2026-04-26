"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "~/server/better-auth/client";
import { Logo } from "~/components/Logo";

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactElement;
}

const BoardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const EmployeesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const SitesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const UsersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

const AccountIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
    <line x1="12" y1="11" x2="12" y2="15" />
    <line x1="10" y1="13" x2="14" y2="13" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

function NavLink({
  href,
  icon,
  label,
  isActive,
  onClick,
  labelClass = "opacity-0 transition-opacity duration-150 group-hover:opacity-100",
}: {
  href: string;
  icon: React.ReactElement;
  label: string;
  isActive: boolean;
  onClick?: () => void;
  labelClass?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={label}
      className={`flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors ${
        isActive
          ? "bg-[var(--color-nav-active-bg)] text-accent"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className={`whitespace-nowrap text-sm font-medium ${labelClass}`}>{label}</span>
    </Link>
  );
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
  }

  const baseItems: NavItem[] = [
    { label: "Board", href: "/board", icon: <BoardIcon /> },
    { label: "Employees", href: "/admin/employees", icon: <EmployeesIcon /> },
    { label: "Sites", href: "/admin/sites", icon: <SitesIcon /> },
  ];

  const adminItems: NavItem[] = isAdmin
    ? [{ label: "Users", href: "/admin/users", icon: <UsersIcon /> }]
    : [];

  const navItems = [...baseItems, ...adminItems];

  return (
    <>
      {/* Desktop sidebar — fixed overlay, icon-only by default, expands on hover */}
      <aside className="group fixed left-0 top-0 z-40 hidden h-full w-14 flex-col overflow-hidden border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] transition-[width] duration-200 ease-in-out hover:w-52 lg:flex">
        {/* Logo */}
        <div className="flex h-14 flex-shrink-0 items-center overflow-hidden border-b border-[var(--color-border-subtle)] px-3">
          <span className="flex-shrink-0"><Logo size={26} /></span>
          <span className="ml-2.5 whitespace-nowrap text-sm font-bold text-[var(--color-text-primary)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            Gridspatch
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-hidden p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              isActive={pathname === item.href || (item.href !== "/board" && pathname.startsWith(item.href))}
            />
          ))}
        </nav>

        {/* Bottom: Account + divider + Sign out */}
        <div className="flex flex-shrink-0 flex-col gap-0.5 border-t border-[var(--color-border-subtle)] p-2">
          <NavLink
            href="/profile"
            icon={<AccountIcon />}
            label="Account"
            isActive={pathname === "/profile"}
          />
          <div className="mx-1 my-0.5 h-px bg-[var(--color-border-subtle)]" />
          <button
            type="button"
            onClick={() => void handleLogout()}
            title="Sign out"
            className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-[var(--color-danger-text)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-hover)]"
          >
            <span className="flex-shrink-0"><LogoutIcon /></span>
            <span className="whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              Sign out
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile: backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile: slide-in drawer */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] transition-transform duration-200 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Mobile header */}
        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-4">
          <div className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="text-sm font-bold text-[var(--color-text-primary)]">Gridspatch</span>
          </div>
          <button
            type="button"
            onClick={onMobileClose}
            title="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Mobile nav */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              isActive={pathname === item.href || (item.href !== "/board" && pathname.startsWith(item.href))}
              onClick={onMobileClose}
              labelClass="text-sm font-medium"
            />
          ))}
        </nav>

        {/* Mobile bottom */}
        <div className="flex flex-shrink-0 flex-col gap-0.5 border-t border-[var(--color-border-subtle)] p-2">
          <NavLink
            href="/profile"
            icon={<AccountIcon />}
            label="Account"
            isActive={pathname === "/profile"}
            onClick={onMobileClose}
            labelClass="text-sm font-medium"
          />
          <div className="mx-1 my-0.5 h-px bg-[var(--color-border-subtle)]" />
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-[var(--color-danger-text)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-hover)]"
          >
            <LogoutIcon />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
