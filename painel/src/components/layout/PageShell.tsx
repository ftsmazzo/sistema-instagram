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
    <div className={`mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 page-enter ${wide ? "max-w-5xl" : "max-w-4xl"}`}>
      <header className="mb-8 lg:mb-10">
        <h1 className="font-display text-3xl sm:text-[2rem] font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? (
          <div className="mt-3 text-base text-slate-600 leading-relaxed max-w-3xl">{description}</div>
        ) : null}
      </header>
      {children}
    </div>
  );
}
