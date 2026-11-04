"use client";

import { Nav } from "@/components/Nav";
import { useT } from "@/lib/i18n/useT";

/** Shared page frame for the owner screens: leaves room for the fixed nav. */
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pb-32">{children}</main>
      <Nav />
    </>
  );
}

export function ScreenHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <header className="pt-3">
      <h1 className="font-display text-4xl font-extrabold leading-none">{title}</h1>
      {detail && <p className="mt-1 text-lg text-graphite">{detail}</p>}
    </header>
  );
}

export function SectionTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="font-display text-2xl font-bold leading-tight">
      {children}
    </h2>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-ink p-4 text-paper">
      <p className="text-lg">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-14 rounded-xl bg-marigold px-4 text-xl font-bold text-ink"
        >
          {t.common.tryAgain}
        </button>
      )}
    </div>
  );
}

export function Spinner({ className = "size-5 border-[3px]" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent motion-reduce:animate-none ${className}`}
    />
  );
}
