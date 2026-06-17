type Props = {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
};

export function Stat({ label, value, sub, accent }: Props) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent
          ? "border-brand-200/60 bg-gradient-to-br from-brand-50 to-emerald-50/50"
          : "border-slate-200/70 bg-white"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="font-display mt-1 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}
