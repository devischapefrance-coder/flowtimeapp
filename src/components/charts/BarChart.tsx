"use client";

interface BarData {
  label: string;
  value: number;
}

export default function BarChart({ data, color = "var(--accent)" }: { data: BarData[]; color?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex items-end gap-1.5" style={{ height: 80 }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full relative" style={{ height: 60 }}>
            <div
              className="absolute bottom-0 w-full rounded-t-md transition-all"
              style={{
                height: `${Math.max(4, (d.value / max) * 60)}px`,
                background: d.value > 0 ? color : "var(--surface2)",
                opacity: d.value > 0 ? 1 : 0.3,
              }}
            />
          </div>
          <span className="text-[9px]" style={{ color: "var(--dim)" }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}
