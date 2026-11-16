'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboardIcon,
  ArrowLeftRightIcon,
  InboxIcon,
  LandmarkIcon,
  PiggyBankIcon,
  CalendarSyncIcon,
  TagsIcon,
  UploadCloudIcon,
  SettingsIcon,
  WalletIcon,
  PlusIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@src/components/auth/user-menu';
import { useAppSettings } from '@src/components/settings/app-settings-provider';
import { useFinanceStore } from '@src/components/finance/shared/finance-store';
import { InboxCountBadge } from '@src/components/finance/inbox/inbox-badge';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: boolean;
}

const trackItems: readonly NavItem[] = [
  {
    label: 'Overview',
    href: '/finance/overview',
    icon: LayoutDashboardIcon,
  },
  {
    label: 'Transactions',
    href: '/finance/transactions',
    icon: ArrowLeftRightIcon,
  },
  {
    label: 'Inbox',
    href: '/finance/inbox',
    icon: InboxIcon,
    badge: true,
  },
];

const manageItems: readonly NavItem[] = [
  {
    label: 'Accounts',
    href: '/finance/accounts',
    icon: LandmarkIcon,
  },
  {
    label: 'Budgets',
    href: '/finance/budgets',
    icon: PiggyBankIcon,
  },
  {
    label: 'Recurring',
    href: '/finance/recurring',
    icon: CalendarSyncIcon,
  },
  {
    label: 'Categories',
    href: '/finance/categories',
    icon: TagsIcon,
  },
];

const toolItems: readonly NavItem[] = [
  {
    label: 'Import',
    href: '/finance/import',
    icon: UploadCloudIcon,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { appName } = useAppSettings();
  const openQuickAdd = useFinanceStore((s) => s.openQuickAdd);

  const isNavActive = (href: string) => {
    if (href === '/finance/overview') {
      return pathname === '/finance/overview' || pathname === '/finance' || pathname === '/';
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b gap-3 p-3">
        {/* Brand Header */}
        <div className="flex items-center gap-2 px-1 py-1">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0 shadow-xs">
            <WalletIcon className="size-4" />
          </div>
          <span
            className="font-semibold text-base tracking-tight truncate group-data-[collapsible=icon]:hidden"
            title={appName}
          >
            {appName}
          </span>
        </div>

        {/* Prominent Quick Add Button */}
        <Button
          type="button"
          onClick={() => openQuickAdd()}
          className="w-full gap-2 shadow-xs group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:mx-auto"
          title="Add transaction"
        >
          <PlusIcon className="size-4 shrink-0" />
          <span className="truncate group-data-[collapsible=icon]:hidden">+ Add transaction</span>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        {/* Group: Track */}
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Track
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {trackItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={isNavActive(item.href)}
                    tooltip={item.label}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <InboxCountBadge className="ml-auto group-data-[collapsible=icon]:hidden" />
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Group: Manage */}
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Manage
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {manageItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={isNavActive(item.href)}
                    tooltip={item.label}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Group: Tools */}
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Tools
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={isNavActive(item.href)}
                    tooltip={item.label}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/settings" />}
              isActive={isNavActive('/settings')}
              tooltip="Settings"
            >
              <SettingsIcon className="size-4 shrink-0" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <UserMenu variant="sidebar" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
