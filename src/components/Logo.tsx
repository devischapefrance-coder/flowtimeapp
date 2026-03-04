"use client";

interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 40, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--teal)" />
        </linearGradient>
        <linearGradient id="logoGrad2" x1="120" y1="0" x2="0" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--text)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      {/* Abstract flowing F — two curved strokes */}
      <path
        d="M30 95 C30 95, 30 30, 60 25 C90 20, 90 55, 60 55"
        stroke="url(#logoGrad)"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M38 65 C50 65, 75 60, 90 45"
        stroke="url(#logoGrad2)"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Dot accent */}
      <circle cx="90" cy="42" r="6" fill="var(--teal)" />
      {/* Small flowing wave at bottom */}
      <path
        d="M35 85 C45 78, 55 92, 65 85 C75 78, 85 92, 95 85"
        stroke="url(#logoGrad)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
    </svg>
  );
}
