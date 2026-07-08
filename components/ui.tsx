import type { LucideIcon } from "lucide-react";

export function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-red-50 text-brand">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold">{value}</p>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
