'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Bot,
  Briefcase,
  Search,
  Settings,
  TrendingUp,
  Zap,
  BarChart2,
} from 'lucide-react';

const navItems: { href: string; label: string; icon: React.ElementType; pulse?: boolean }[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/bot', label: 'AlphaBot', icon: Bot, pulse: true },
  { href: '/market', label: 'Live Market', icon: BarChart2 },
  { href: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { href: '/research', label: 'Research', icon: Search },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 min-h-screen bg-[#0d0d0d] border-r border-white/10 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-[#AAFF00] flex items-center justify-center">
            <Zap size={16} className="text-black" fill="black" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight" style={{ fontFamily: 'var(--font-syne)' }}>
            Alpha<span className="text-[#AAFF00]">Bot</span>
          </span>
        </div>
        <p className="text-white/30 text-[10px] font-mono mt-1 tracking-widest">AI TRADING SIMULATOR</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3">
        <ul className="space-y-1">
          {navItems.map(({ href, label, icon: Icon, pulse }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all',
                    active
                      ? 'bg-[#AAFF00]/10 text-[#AAFF00] border border-[#AAFF00]/20'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  )}
                >
                  <Icon size={16} />
                  {label}
                  {pulse && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-[#AAFF00] animate-pulse" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2 text-white/30 text-xs font-mono">
          <TrendingUp size={12} />
          <span>Paper Trading Mode</span>
        </div>
        <p className="text-white/20 text-[10px] mt-1">No real money involved</p>
      </div>
    </aside>
  );
}
