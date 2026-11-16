'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboardIcon,
    ArrowLeftRightIcon,
    WalletIcon,
    PieChartIcon,
    RepeatIcon,
    UploadCloudIcon,
    SettingsIcon,
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
} from '@/components/ui/sidebar';

const navItems = [
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
        label: 'Accounts',
        href: '/finance/accounts',
        icon: WalletIcon,
    },
    {
        label: 'Budgets',
        href: '/finance/budgets',
        icon: PieChartIcon,
    },
    {
        label: 'Recurring',
        href: '/finance/recurring',
        icon: RepeatIcon,
    },
    {
        label: 'Import',
        href: '/finance/import',
        icon: UploadCloudIcon,
    },
    {
        label: 'Settings',
        href: '/settings',
        icon: SettingsIcon,
    },
] as const;
import { UserMenu } from '@src/components/auth/user-menu';
import { useAppSettings } from '@src/components/settings/app-settings-provider';

export function AppSidebar() {
    const pathname = usePathname();
    const { appName } = useAppSettings();

    const visibleNavItems = navItems;

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader className="border-b">
                <div className="flex items-center gap-2 px-2 py-3">
                    <WalletIcon className="size-5 text-primary shrink-0" />
                    <span
                        className="font-semibold text-base tracking-tight truncate group-data-[collapsible=icon]:hidden"
                        title={appName}
                    >
                        {appName}
                    </span>
                </div>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Navigation</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {visibleNavItems.map((item) => {
                                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                                return (
                                    <SidebarMenuItem key={item.href}>
                                        <SidebarMenuButton
                                            render={<Link href={item.href} />}
                                            isActive={isActive}
                                            tooltip={item.label}
                                        >
                                            <item.icon className="size-4 shrink-0" />
                                            <span>{item.label}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                );
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="border-t p-2">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <UserMenu variant="sidebar" />
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}
