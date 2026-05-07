'use client';

import React, { useEffect, useState } from 'react';
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
  Bell,
} from 'lucide-react';

const navItems: { href: string; label: string; icon: React.ElementType; pulse?: boolean; alertBadge?: boolean }[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/bot', label: 'AlphaBot', icon: Bot, pulse: true },
  { href: '/market', label: 'Live Market', icon: BarChart2 },
  { href: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { href: '/alerts', label: 'Alerts', icon: Bell, alertBadge: true },
  { href: '/research', label: 'Research', icon: Search },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [autopilotOn, setAutopilotOn] = useState(false);

  useEffect(() => {
    // Poll unread alerts count
    const fetchUnread = async () => {
      try {
        const r = await fetch('/api/alerts?unread=true&limit=1');
        const d = await r.json();
        setUnreadCount(d.unreadCount ?? 0);
      } catch { /* silent */ }
    };
    fetchUnread();
    const i = setInterval(fetchUnread, 30000);

    // Poll autopilot state
    const fetchAutopilot = async () => {
      try {
        const r = await fetch('/api/autopilot');
        const d = await r.json();
        setAutopilotOn(d.isEnabled ?? false);
      } catch { /* silent */ }
    };
    fetchAutopilot();
    const j = setInterval(fetchAutopilot, 15000);

    return () => { clearInterval(i); clearInterval(j); };
  }, []);

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

        {/* Autopilot active badge */}
        {autopilotOn && (
          <div className="mt-3 flex items-center gap-1.5 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            <span className="text-green-400 text-[9px] font-mono font-bold tracking-wider">AUTOPILOT ACTIVE</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3">
        <ul className="space-y-1">
          {navItems.map(({ href, label, icon: Icon, pulse, alertBadge }) => {
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
                  {alertBadge && unreadCount > 0 && (
                    <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-1">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
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
