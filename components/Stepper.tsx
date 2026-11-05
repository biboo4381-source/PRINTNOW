import clsx from "clsx";
import { Check } from "lucide-react";

const STEPS = ["Upload", "Settings", "Pay", "Collect"] as const;

/** Progress indicator. `current` is 0-based. */
export function Stepper({ current }: { current: number }) {
  return (
    <nav aria-label="Order progress" className="mb-6">
      <ol className="flex items-center gap-1.5 sm:gap-3">
        {STEPS.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className="flex flex-1 items-center gap-1.5 sm:gap-3" aria-current={active ? "step" : undefined}>
              <span
                className={clsx(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  done && "bg-green text-white",
                  active && "bg-brand text-white ring-4 ring-brand-100",
                  !done && !active && "bg-white text-ink-muted ring-1 ring-line",
                )}
              >
                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
              </span>
              <span className={clsx("text-sm font-semibold", active ? "text-navy" : "text-ink-muted", !active && "hidden sm:inline")}>
                {label}
                {done && <span className="sr-only"> (done)</span>}
              </span>
              {i < STEPS.length - 1 && <span className={clsx("h-0.5 flex-1 rounded", done ? "bg-green" : "bg-line")} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
