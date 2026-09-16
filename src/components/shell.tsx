"use client";

/**
 * FAST GUNS — application shell.
 * Mobile-first: top bar + content + bottom navigation.
 * Desktop: left sidebar + centered content column.
 */

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useAppStore, type Tab } from "@/store/app-store";
import { StatePill, Wordmark } from "@/components/common";
import { cn } from "@/lib/utils";
import { Lock, MessageSquareLock, Shield, Settings2, UsersRound } from "lucide-react";

const TABS: { id: Tab; label: string; icon: typeof MessageSquareLock }[] = [
  { id: "chats", label: "Chats", icon: MessageSquareLock },
  { id: "contacts", label: "Contacts", icon: UsersRound },
  { id: "security", label: "Security", icon: Shield },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const lockVault = useAppStore((s) => s.lockVault);
  const connection = useAppStore((s) => s.connection);
  const totalUnread = useAppStore((s) =>
    s.conversations.reduce((acc, c) => acc + c.unread, 0)
  );
  const identityName = useAppStore((s) => s.identityPublic?.name ?? "");

  return (
    <div className="flex min-h-screen bg-ink">
      {/* ---------------- desktop sidebar ---------------- */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/70 bg-sidebar px-4 py-5 lg:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <Image src="/fastguns-logo.png" alt="FAST GUNS emblem" width={34} height={34} className="rounded-md" />
          <Wordmark />
        </div>
        <nav className="flex flex-col gap-1" aria-label="Primary">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left font-mono text-[11px] tracking-[0.2em] uppercase transition-colors",
                tab === t.id
                  ? "bg-silver/10 text-silver shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                  : "text-muted-foreground hover:bg-charcoal hover:text-silver"
              )}
            >
              <t.icon className="size-4" />
              {t.label}
              {t.id === "chats" && totalUnread > 0 ? (
                <span className="ml-auto rounded-full bg-silver px-1.5 py-0.5 font-mono text-[9px] font-bold text-ink">
                  {totalUnread}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-3 px-2">
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="font-mono text-[9px] tracking-[0.22em] text-metal uppercase">Device</p>
            <p className="mt-1 truncate text-[13px] text-silver">{identityName || "—"}</p>
          </div>
          <button
            onClick={lockVault}
            className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2.5 font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase transition-colors hover:border-alert/40 hover:text-red-300"
          >
            <Lock className="size-3.5" /> Lock vault
          </button>
        </div>
      </aside>

      {/* ---------------- main column ---------------- */}
      <div className="flex min-h-screen w-full flex-1 flex-col lg:h-screen lg:overflow-hidden">
        {/* top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border/70 bg-ink/90 px-4 pt-safe backdrop-blur-sm lg:px-6 lg:py-3">
          <div className="flex items-center gap-2.5 py-3 lg:py-0">
            <Image
              src="/fastguns-logo.png"
              alt="FAST GUNS emblem"
              width={28}
              height={28}
              className="rounded-md lg:hidden"
            />
            <span className="font-mono text-[11px] font-semibold tracking-[0.28em] text-silver uppercase lg:hidden">
              Fast Guns
            </span>
            <span className="hidden font-mono text-[10px] tracking-[0.26em] text-metal uppercase lg:block">
              Fast Guns · Encrypted Communications
            </span>
          </div>
          <div className="flex items-center gap-2 py-3 lg:py-0">
            <StatePill state={connection.state} />
            <Button
              variant="outline"
              size="icon"
              onClick={lockVault}
              className="size-9 rounded-lg border-input text-silver hover:bg-charcoal"
              aria-label="Lock vault"
            >
              <Lock className="size-4" />
            </Button>
          </div>
        </header>

        {/* content */}
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-28 lg:max-w-3xl lg:pb-8">
          {children}
        </main>

        {/* bottom nav (mobile) */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-ink/95 backdrop-blur-sm lg:hidden"
          aria-label="Primary"
        >
          <ul className="mx-auto grid max-w-md grid-cols-4 px-2 pb-safe">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => setTab(t.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-[56px] w-full flex-col items-center justify-center gap-1 py-2 transition-colors",
                      active ? "text-silver" : "text-muted-foreground hover:text-silver"
                    )}
                  >
                    <t.icon className="size-5" />
                    <span className="font-mono text-[9px] tracking-[0.18em] uppercase">{t.label}</span>
                    {t.id === "chats" && totalUnread > 0 ? (
                      <span className="absolute right-[22%] top-1.5 rounded-full bg-silver px-1.5 py-0.5 font-mono text-[8px] font-bold text-ink">
                        {totalUnread}
                      </span>
                    ) : null}
                    {active ? (
                      <span className="absolute top-0 h-0.5 w-8 rounded-full bg-silver" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

/** Full-screen overlay panel wrapper (mobile sheet style, centered on desktop) */
export function OverlayPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink lg:items-center lg:overflow-y-auto lg:py-8">
      <div className="flex h-full w-full flex-col lg:max-w-2xl lg:rounded-2xl lg:border lg:border-border lg:shadow-2xl">
        {children}
      </div>
    </div>
  );
}
