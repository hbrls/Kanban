interface OverviewCardProps {
  className?: string;
  eyebrow: string;
  title: string;
  description: string;
  meta: string[];
  actionLabel: string;
  onAction: () => void;
}

export function OverviewCard({
  className,
  eyebrow,
  title,
  description,
  meta,
  actionLabel,
  onAction,
}: OverviewCardProps) {
  return (
    <section className={`rounded-[24px] border border-desktop-border bg-desktop-bg-secondary p-5 ${className ?? ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-desktop-text-muted">
        {eyebrow}
      </div>
      <div className="mt-3 text-xl font-semibold tracking-tight text-desktop-text-primary">
        {title}
      </div>
      <div className="mt-2 text-sm leading-6 text-desktop-text-secondary">
        {description}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {meta.map((item) => (
          <span
            key={item}
            className="rounded-full border border-desktop-border bg-desktop-bg-primary/50 px-2.5 py-1 text-[11px] text-desktop-text-secondary"
          >
            {item}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onAction}
        className="mt-5 rounded-md border border-desktop-border px-3 py-2 text-[12px] font-medium text-desktop-text-secondary transition-colors hover:bg-desktop-bg-active hover:text-desktop-text-primary"
      >
        {actionLabel}
      </button>
    </section>
  );
}
