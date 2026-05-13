import type { ReactNode } from "react";

type PageShellProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Telas com formulários longos (ex.: Admin) */
  wide?: boolean;
};

export function PageShell({ title, description, children, wide }: PageShellProps) {
  return (
    <div className={`mx-auto px-6 sm:px-10 lg:px-12 py-10 lg:py-12 page-enter ${wide ? "max-w-6xl" : "max-w-5xl"}`}>
      <header className="mb-10 lg:mb-12">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description ? (
          <div className="mt-3 text-base text-slate-500 leading-relaxed max-w-3xl font-medium">{description}</div>
        ) : null}
      </header>
      {children}
    </div>
  );
}
