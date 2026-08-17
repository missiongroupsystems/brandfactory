"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Shared UI atoms — all styling flows from the semantic tokens in globals.css. */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-surface-accent text-ink-inverse hover:brightness-110 active:brightness-95 border border-transparent",
  secondary: "bg-surface text-ink border border-border hover:bg-surface-hover active:bg-surface-selected",
  ghost: "bg-transparent text-ink-secondary border border-transparent hover:bg-surface-hover",
  danger: "bg-error text-ink-inverse border border-transparent hover:brightness-110",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-120 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-disabled ${
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm"
      } ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

type PillTone = "neutral" | "success" | "warning" | "error" | "info";

const PILL_STYLES: Record<PillTone, string> = {
  neutral: "bg-surface-sunken text-ink-secondary",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  error: "bg-error-tint text-error",
  info: "bg-info-tint text-info",
};

export function Pill({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL_STYLES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface shadow-e1 ${className}`}
    >
      {children}
    </div>
  );
}

/** Segmented control — selected segment is accent-filled per §12.5. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <div role="tablist" className="inline-flex gap-0.5 rounded-lg bg-surface-sunken p-0.5">
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <button
            key={opt}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt)}
            className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors duration-120 ${
              selected
                ? "bg-surface-accent font-medium text-ink-inverse"
                : "text-ink-secondary hover:bg-surface-hover"
            }`}
          >
            {labels?.[opt] ?? opt}
          </button>
        );
      })}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-ink-secondary">{label}</span>
      {children}
      {hint ? <span className="text-[13px] text-ink-tertiary">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "h-8 w-full rounded-lg border border-input bg-surface px-3 text-sm text-ink placeholder:text-ink-tertiary focus:border-brand";
