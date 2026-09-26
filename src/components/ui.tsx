import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "navy" | "soft" | "ghost" | "danger";
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-opacity disabled:opacity-50",
        variant === "primary" && "bg-brass text-bg",
        variant === "navy" && "bg-ink text-bg",
        variant === "soft" && "bg-brass-soft text-brass",
        variant === "ghost" && "bg-transparent text-ink",
        variant === "danger" && "bg-give-soft text-give",
        className,
      )}
      {...props}
    />
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink outline-none placeholder:text-muted focus:border-brass",
        className,
      )}
      {...props}
    />
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-xl border border-line bg-surface px-3 py-3 text-base text-ink outline-none placeholder:text-muted focus:border-brass",
        className,
      )}
      {...props}
    />
  );
}

export function SelectInput({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink outline-none focus:border-brass",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
      {label}
      {children}
    </label>
  );
}

export function PageIntro({ title, lede }: { title: string; lede?: string }) {
  return (
    <div className="mb-4">
      <h1 className="font-display text-3xl leading-tight tracking-tight text-ink">{title}</h1>
      {lede ? <p className="mt-1 text-sm text-muted">{lede}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-5 py-8 text-center">
      <p className="font-display text-2xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{body}</p>
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <AlertDialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 rounded-2xl border border-line bg-surface p-5">
          <AlertDialog.Title className="font-display text-2xl text-ink">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted">{body}</AlertDialog.Description>
          <div className="mt-5 flex gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost" className="flex-1 border border-line">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={danger ? "danger" : "primary"} className="flex-1" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
