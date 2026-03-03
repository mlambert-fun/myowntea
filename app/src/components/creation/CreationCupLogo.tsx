interface CreationCupLogoProps {
  fillColor: string;
  ingredientCount?: number;
  className?: string;
}

export function CreationCupLogo({ fillColor, ingredientCount = 0, className = '' }: CreationCupLogoProps) {
  const cappedCount = Math.min(Math.max(ingredientCount, 0), 10);
  const liquidRx = 50 + cappedCount * 2;
  const liquidRy = 12 + cappedCount * 0.5;

  return (
    <svg viewBox="0 0 200 200" className={className}>
      <path d="M40,60 Q40,160 100,160 Q160,160 160,60" fill="none" stroke="#D4C4A8" strokeWidth="3" />
      <ellipse cx="100" cy="60" rx="60" ry="15" fill="none" stroke="#D4C4A8" strokeWidth="3" />
      <ellipse cx="100" cy="65" rx={liquidRx} ry={liquidRy} fill={fillColor} opacity="0.8" />
      <path d="M160,80 Q190,80 190,110 Q190,140 160,140" fill="none" stroke="#D4C4A8" strokeWidth="3" />
    </svg>
  );
}
