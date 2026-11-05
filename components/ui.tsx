import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "success";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 select-none";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-600 active:bg-brand-700 shadow-[0_6px_16px_rgb(8_119_249/0.28)]",
  secondary: "bg-white text-navy border-2 border-line hover:border-brand hover:text-brand",
  ghost: "text-brand hover:bg-brand-50",
  success: "bg-green text-white hover:bg-[#117a3a] shadow-[0_6px_16px_rgb(21_148_71/0.28)]",
};
const sizes: Record<Size, string> = {
  md: "min-h-12 px-5 text-base",
  lg: "min-h-14 px-7 text-lg",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  // twMerge lets per-use classes (e.g. px-0, h-12) reliably override the defaults.
  return twMerge(clsx(base, variants[variant], sizes[size], extra));
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={twMerge(clsx("rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)]", className))} {...props} />;
}

const alertStyles = {
  info: { box: "bg-brand-50 text-navy border-brand-100", Icon: Info, icon: "text-brand" },
  success: { box: "bg-green-50 text-navy border-green/20", Icon: CircleCheck, icon: "text-green" },
  warning: { box: "bg-warning-50 text-navy border-warning/20", Icon: TriangleAlert, icon: "text-warning" },
  error: { box: "bg-danger-50 text-navy border-danger/20", Icon: CircleAlert, icon: "text-danger" },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof alertStyles;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const s = alertStyles[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={clsx("flex gap-3 rounded-2xl border p-4", s.box, className)}>
      <s.Icon className={clsx("mt-0.5 h-5 w-5 shrink-0", s.icon)} aria-hidden="true" />
      <div className="min-w-0 text-[0.95rem]">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && "mt-0.5", "text-ink-muted")}>{children}</div>}
      </div>
    </div>
  );
}

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={clsx("mx-auto w-full max-w-5xl px-4 sm:px-6", className)} {...props} />;
}

export function PageTitle({ eyebrow, title, subtitle }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      {eyebrow && <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-brand">{eyebrow}</p>}
      <h1 className="text-[1.75rem] font-extrabold sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-lg text-ink-muted [overflow-wrap:anywhere]">{subtitle}</p>}
    </div>
  );
}
