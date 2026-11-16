'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    UserRoundIcon,
    ShieldCheckIcon,
    PaletteIcon,
    LandmarkIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface NavItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
    { label: 'Profile', href: '/settings/profile', icon: UserRoundIcon },
    { label: 'Security', href: '/settings/security', icon: ShieldCheckIcon },
    { label: 'Appearance', href: '/settings/appearance', icon: PaletteIcon },
    { label: 'Finance', href: '/settings/finance', icon: LandmarkIcon },
];

export function SettingsNav() {
    const pathname = usePathname();
    const router = useRouter();

    const currentActive =
        navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
            ?.href ?? '/settings/profile';

    return (
        <aside className="w-full md:w-56 shrink-0">
            {/* Small screen: horizontal Tabs row */}
            <div className="block md:hidden pb-4">
                <Tabs value={currentActive} onValueChange={(val) => router.push(val)}>
                    <TabsList className="w-full flex justify-start overflow-x-auto no-scrollbar py-1">
                        {navItems.map((item) => (
                            <TabsTrigger
                                key={item.href}
                                value={item.href}
                                className="gap-2 shrink-0 text-xs sm:text-sm"
                            >
                                <item.icon className="size-4" />
                                <span>{item.label}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            {/* Medium/large screen: vertical navigation list */}
            <div className="hidden md:flex flex-col gap-1">
                <nav className="flex flex-col gap-1" aria-label="Settings navigation">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    'flex items-center gap-2.5 px-3 py-2 text-sm rounded-md font-medium transition-colors',
                                    isActive
                                        ? 'bg-muted text-foreground font-semibold shadow-xs'
                                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                )}
                            >
                                <item.icon
                                    className={cn(
                                        'size-4 shrink-0',
                                        isActive ? 'text-foreground' : 'text-muted-foreground'
                                    )}
                                />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </aside>
    );
}
