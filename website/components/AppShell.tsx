'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { hydrateImportedRepositories, useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import ImportRepositoryModal from './ImportRepositoryModal';

export const navItems: [string, string, string][] = [
  ['Analysis', 'spark', '/analysis'],
  ['Repositories', 'branch', '/repositories'],
  ['My notebooks', 'book', '/notebooks'],
  ['Knowledge graph', 'nodes', '/knowledge-graph'],
  ['Shared with me', 'users', '/shared'],
];

const iconPaths: Record<string, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
  branch: <><circle cx="6" cy="4" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="20" r="2"/><path d="M6 6v12M8 8c5 0 4-2 8-2"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  tag: <><path d="M20.6 13.6 11 23.2 1.8 14V2h12l6.8 6.8a3.4 3.4 0 0 1 0 4.8Z"/><circle cx="7" cy="8" r="1.5"/></>,
  chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19V2"/><path d="M2 19h22"/></>,
  nodes: <><circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="m10.5 7.6-4 8.1M13.5 7.6l4 8.1M8 19h8"/></>,
  search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  upload: <><path d="M12 16V3M7 8l5-5 5 5M4 14v6h16v-6"/></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></>,
  spark: <><path d="m12 3-1.4 4.1a5.4 5.4 0 0 1-3.4 3.4L3 12l4.2 1.4a5.4 5.4 0 0 1 3.4 3.4L12 21l1.4-4.2a5.4 5.4 0 0 1 3.4-3.4L21 12l-4.2-1.5a5.4 5.4 0 0 1-3.4-3.4Z"/></>,
  check: <path d="M20 6 9 17l-5-5"/>,
  alert: <><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></>,
  chevron: <path d="m6 9 6 6 6-6"/>,
  external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/></>,
  x: <path d="M18 6 6 18M6 6l12 12"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>,
  github: <><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7.4A5.8 5.8 0 0 0 19.3 3 5.4 5.4 0 0 0 19.1 0S17.9-.4 15 1.6a14 14 0 0 0-6 0C6.1-.4 4.9 0 4.9 0a5.4 5.4 0 0 0-.2 3A5.8 5.8 0 0 0 3.2 7.1c0 5.8 3.5 7 6.8 7.4A4.8 4.8 0 0 0 9 18v4"/><path d="M9 19c-3 .9-3-1.5-4.2-2"/></>,
  layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
  fileSearch: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7"/><path d="M14 2v6h6M9 13h3"/><circle cx="18" cy="17" r="3"/><path d="m20.5 19.5 2 2"/></>,
  terminal: <><path d="m4 17 6-6-6-6M12 19h8"/></>,
  rerun: <><path d="M20 6v5h-5"/><path d="M19 11a7.5 7.5 0 1 0 1 6"/></>,
  play: <path d="M6 4l14 8-14 8V4z" fill="currentColor" stroke="none"/>,
  panelLeft: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M14 8l-4 4 4 4"/></>,
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {iconPaths[name]}
    </svg>
  );
}

export function ScoreRing({ score, size = 31 }: { score: number | null; size?: number }) {
  const color = score === null ? 'var(--fg-subtle)' : score >= 90 ? 'var(--success-fg)' : score >= 80 ? 'var(--brand-fg)' : score >= 70 ? 'var(--attention-fg)' : 'var(--danger-fg)';
  const inner = size - 6;
  return (
    <span className={`score-ring ${score === null ? 'pending' : ''}`} style={{ width: size, height: size, background: `conic-gradient(${color} ${(score ?? 0) * 3.6}deg, var(--border-muted) 0deg)` }}>
      <span style={{ width: inner, height: inner, fontSize: size >= 60 ? 15 : 7 }}>{score ?? '—'}</span>
    </span>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('theme', next);
    } catch {
      void 0;
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button className="icon-button" variant="outline" size="icon" aria-label={theme === 'dark' ? 'Use light mode' : 'Use dark mode'} type="button" onClick={toggle}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</TooltipContent>
    </Tooltip>
  );
}

function Sidebar({ active, collapsed, onToggle }: { active: string; collapsed: boolean; onToggle: () => void }) {
  const { notebooks } = useStore();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">N</span><span className="brand-name">NotebookFair</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="sidebar-toggle" variant="ghost" size="icon-sm" type="button" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              <Icon name="panelLeft" size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</TooltipContent>
        </Tooltip>
      </div>
      <nav aria-label="Main navigation">
        {navItems.map(([label, icon, href]) => (
          <Link className={`nav-item ${label === active ? 'active' : ''}`} href={href} key={label} title={collapsed ? label : undefined}>
            <Icon name={icon} />
            <span>{label}</span>
            {label === 'My notebooks' && <b>{notebooks.length}</b>}
          </Link>
        ))}
      </nav>
      <section className="usage-card">
        <div className="usage-head"><span>Workspace usage</span><strong>68%</strong></div>
        <div className="usage-track"><i /></div>
        <p>8.2 GB of 12 GB used</p>
        <button type="button">Manage storage</button>
      </section>
      <div className="profile-card">
        <span className="avatar">DK</span>
        <span><strong>David Keci</strong><small>Research workspace</small></span>
        <button aria-label="Profile options" type="button">...</button>
      </div>
    </aside>
  );
}

function Topbar({ onImport }: { onImport: () => void }) {
  return (
    <header className="topbar">
      <label className="search"><Icon name="search" size={17} /><Input className="topbar-search-input" aria-label="Search" placeholder="Search notebooks, repositories..." /><kbd>Ctrl K</kbd></label>
      <div className="top-actions">
        <ThemeToggle />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="icon-button" variant="outline" size="icon" aria-label="Notifications" type="button"><Icon name="bell" /></Button>
          </TooltipTrigger>
          <TooltipContent>Notifications</TooltipContent>
        </Tooltip>
        <Button className="button secondary" variant="outline" type="button" onClick={onImport}><Icon name="upload" size={16} />Import repository</Button>
      </div>
    </header>
  );
}

export function PageHeading({ eyebrow, title, subtitle, status }: { eyebrow: string; title: string; subtitle: string; status?: string }) {
  return (
    <div className="page-heading">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>
      {status && <span className="sync-status"><i />{status}</span>}
    </div>
  );
}

export default function AppShell({ active, children }: { active: string; children: React.ReactNode }) {
  const [importOpen, setImportOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    void hydrateImportedRepositories();
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setSidebarCollapsed(localStorage.getItem('sidebar-collapsed') === 'true');
      } catch {
        void 0;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem('sidebar-collapsed', String(next));
      } catch {
        void 0;
      }
      return next;
    });
  }

  return (
    <main className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar active={active} collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <section className="workspace">
        <Topbar onImport={() => setImportOpen(true)} />
        <div className="content">{children}</div>
      </section>
      <ImportRepositoryModal open={importOpen} onClose={() => setImportOpen(false)} />
    </main>
  );
}
