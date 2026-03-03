import type { ReactNode } from 'react';

interface AccountCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
}

export function AccountCard({ title, description, action, children }: AccountCardProps) {
  return (
    <div className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-[var(--sage-deep)]">{title}</h2>
          {description && <p className="text-sm text-[var(--sage-deep)]/60 mt-1">{description}</p>}
        </div>
        {action}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
