import type { ReactNode } from "react";

type PageShellProps = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** `wide` for workspace/debrief grids, `narrow` for forms and reading pages. */
  width?: "narrow" | "default" | "wide";
  children: ReactNode;
};

const WIDTHS = { narrow: "max-w-2xl", default: "max-w-5xl", wide: "max-w-7xl" } as const;

/**
 * The page's `<main>` with the shared gutter (16px on phones) and an optional
 * heading row. Every route renders exactly one PageShell (the skip link targets it).
 */
export default function PageShell({ title, description, actions, width = "default", children }: PageShellProps) {
  return (
    <main id="main" className={`mx-auto w-full ${WIDTHS[width]} px-4 py-8 sm:px-6 sm:py-10`}>
      {(title || actions) && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {title && <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>}
            {description && <p className="mt-2 max-w-prose text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </main>
  );
}
