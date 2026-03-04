"use client";

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, title, subtitle, action, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="text-sm font-bold mb-1">{title}</p>
      {subtitle && (
        <p className="text-xs mb-4" style={{ color: "var(--dim)" }}>{subtitle}</p>
      )}
      {action && onAction && (
        <button
          className="text-xs font-bold px-4 py-2 rounded-xl"
          style={{ background: "var(--accent)", color: "#fff" }}
          onClick={onAction}
        >
          {action}
        </button>
      )}
    </div>
  );
}
