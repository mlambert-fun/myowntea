type StripeWordmarkProps = {
  className?: string;
};

export function StripeWordmark({ className = '' }: StripeWordmarkProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 56 20"
      className={`h-4 w-auto shrink-0 ${className}`.trim()}
    >
      <rect width="56" height="20" rx="10" fill="#635BFF" />
      <text
        x="28"
        y="13.4"
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize="9.5"
        fontWeight="700"
        fontFamily="Arial, sans-serif"
        letterSpacing="0.08em"
      >
        STRIPE
      </text>
    </svg>
  );
}
