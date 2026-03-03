"use client";

interface DonutData {
  label: string;
  value: number;
  color: string;
  emoji: string;
}

export default function DonutChart({ data }: { data: DonutData[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const radius = 50;
  const cx = 60;
  const cy = 60;
  const stroke = 14;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" width="120" height="120">
        {data.filter(d => d.value > 0).map((d, i) => {
          const pct = d.value / total;
          const dash = pct * circumference;
          const el = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="round"
            />
          );
          offset += dash;
          return el;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text)" fontSize="18" fontWeight="bold">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--dim)" fontSize="8">
          minutes
        </text>
      </svg>
      <div className="flex flex-col gap-1.5">
        {data.filter(d => d.value > 0).map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-xs">{d.emoji}</span>
            <span className="text-[11px]" style={{ color: "var(--dim)" }}>{d.label}</span>
            <span className="text-[11px] font-bold ml-auto">{d.value}m</span>
          </div>
        ))}
      </div>
    </div>
  );
}
