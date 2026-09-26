import { useEffect, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, BookOpen, Building2, Home, Plus, ReceiptText, Users } from "lucide-react";
import { Toaster } from "sonner";
import { BillDrawer, PaymentDrawer } from "@/components/bill-drawers";
import { ItemDrawer } from "@/components/items";
import { StockDrawer } from "@/components/stock";
import { BooksDrawer, EntryDrawer, PartyDrawer, SiteDrawer } from "@/components/drawers";
import { InstallPcBar } from "@/components/install-pc";
import { cn } from "@/lib/cn";
import { useLedger, useUi } from "@/lib/store";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/parties", label: "Parties", icon: Users },
  { href: "/bills", label: "Bills", icon: ReceiptText },
  { href: "/sites", label: "Sites", icon: Building2 },
  { href: "/reports", label: "Reports", icon: BarChart3 },
] as const;

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/parties") return path === "/parties" || path.startsWith("/party/");
  if (href === "/bills") return path === "/bills" || path.startsWith("/bill/");
  if (href === "/sites") return path === "/sites" || path.startsWith("/site/");
  return path === href;
}

function typingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function KhataSkeleton() {
  return (
    <div className="min-h-dvh bg-bg">
      <div className="bg-header px-5 py-5 text-bg">
        <p className="font-display text-3xl leading-none">Sitekhata</p>
        <p className="mt-2 text-sm">Opening your books…</p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useLedger((state) => state.hydrated);
  const businessName = useLedger((state) => state.businessName);
  const openAdd = useUi((state) => state.openAdd);
  const setBooksOpen = useUi((state) => state.setBooksOpen);
  const path = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    let cancelled = false;
    const done = () => {
      if (!cancelled) useLedger.setState({ hydrated: true });
    };
    const unsub = useLedger.persist.onFinishHydration(done);
    if (useLedger.persist.hasHydrated()) done();
    else {
      const pending = useLedger.persist.rehydrate();
      void Promise.resolve(pending).catch(done);
    }
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typingTarget(event.target)) return;
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        openAdd();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAdd]);

  if (!hydrated) return <KhataSkeleton />;

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <div className="flex h-dvh min-h-0 overflow-hidden">
        <aside className="bg-header hidden h-full w-56 shrink-0 flex-col text-bg lg:flex">
          <div className="px-5 pb-4 pt-6">
            <div className="flex items-center gap-2">
              <BookOpen className="size-5 text-bg" aria-hidden="true" />
              <p className="font-display text-2xl leading-none">Sitekhata</p>
            </div>
            <p className="mt-2 text-sm text-bg/80">Office khata</p>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-3">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = isActive(path, item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold",
                    active ? "bg-surface/15 text-bg" : "text-bg/75",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-4">
            <button
              type="button"
              onClick={() => setBooksOpen(true)}
              className="w-full truncate rounded-xl px-3 py-2 text-left text-sm text-bg/80"
            >
              {businessName}
            </button>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="bg-header flex items-center justify-between gap-3 px-4 py-3 text-bg shadow-md lg:hidden">
            <div className="min-w-0">
              <p className="font-display text-2xl leading-none">Sitekhata</p>
              <button type="button" onClick={() => setBooksOpen(true)} className="mt-1 max-w-full truncate text-left text-xs text-bg/80">
                {businessName}
              </button>
            </div>
            <button
              type="button"
              onClick={() => openAdd()}
              className="flex h-11 items-center gap-1 rounded-xl bg-surface px-3 text-sm font-semibold text-brass shadow-sm"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add
            </button>
          </header>

          <div className="hidden items-center justify-between gap-4 border-b border-line bg-surface px-8 py-3 lg:flex">
            <button type="button" onClick={() => setBooksOpen(true)} className="min-w-0 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Firm</p>
              <p className="truncate font-display text-xl leading-tight">{businessName}</p>
            </button>
            <button
              type="button"
              onClick={() => openAdd()}
              className="flex h-11 items-center gap-3 rounded-xl bg-brass px-4 text-sm font-semibold text-bg"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add entry
              <kbd className="rounded-md bg-ink/15 px-1.5 py-0.5 text-xs font-semibold">N</kbd>
            </button>
          </div>
          <InstallPcBar />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-4 lg:px-8 lg:pb-8 lg:pt-6">{children}</main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(path, item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold",
                  active ? "text-brass" : "text-muted",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <EntryDrawer />
      <PartyDrawer />
      <SiteDrawer />
      <BooksDrawer />
      <BillDrawer />
      <PaymentDrawer />
      <ItemDrawer />
      <StockDrawer />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "var(--color-surface)",
            color: "var(--color-ink)",
            border: "1px solid var(--color-line)",
          },
        }}
      />
    </div>
  );
}
