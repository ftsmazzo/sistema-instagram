import type { ReactNode } from "react";

export type TabItem = {
  id: string;
  label: string;
  badge?: string | number;
};

type Props = {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
};

export function Tabs({ tabs, activeId, onChange, className = "" }: Props) {
  return (
    <div
      className={`flex gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`relative shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
              active
                ? "bg-white text-brand-800 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            }`}
          >
            {tab.label}
            {tab.badge != null && tab.badge !== "" ? (
              <span
                className={`ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active ? "bg-brand-100 text-brand-800" : "bg-slate-200 text-slate-600"
                }`}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mt-8 ${className}`}>{children}</div>;
}
