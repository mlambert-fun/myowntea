import { useId } from 'react';
import { MAX_BLEND_INGREDIENTS } from '@/lib/blend-pricing';

interface CreationCupLogoProps {
  fillColor: string;
  ingredientCount?: number;
  className?: string;
}

const CUP_INNER_TOP_Y = 60;
const CUP_INNER_BOTTOM_Y = 157;
const CUP_INNER_HALF_WIDTH = 57;
const LIQUID_SURFACE_EMPTY_Y = 148;
const LIQUID_SURFACE_FULL_Y = 70;
const LIQUID_SIDE_INSET = 3;
const LIQUID_FIRST_INGREDIENT_FILL_RATIO = 0.6;
const LIQUID_SURFACE_TOP_CLEARANCE = 1;

function getCupHalfWidthAtY(y: number) {
  const normalizedHeight = Math.min(
    Math.max((y - CUP_INNER_TOP_Y) / (CUP_INNER_BOTTOM_Y - CUP_INNER_TOP_Y), 0),
    1,
  );
  const curvePosition = 1 - Math.sqrt(1 - normalizedHeight);

  return CUP_INNER_HALF_WIDTH * (1 - curvePosition * curvePosition);
}

function getLiquidSurfaceRadiusX(y: number) {
  return Math.max(getCupHalfWidthAtY(y) - LIQUID_SIDE_INSET, 0);
}

function getLiquidSurfaceRadiusY(rx: number) {
  return Math.max(4, Math.min(12, rx * 0.22));
}

export function CreationCupLogo({ fillColor, ingredientCount = 0, className = '' }: CreationCupLogoProps) {
  const clipPathId = `cup-liquid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const cappedCount = Math.min(Math.max(ingredientCount, 0), MAX_BLEND_INGREDIENTS);
  const hasLiquid = cappedCount > 0;
  const ingredientProgress = hasLiquid
    ? LIQUID_FIRST_INGREDIENT_FILL_RATIO +
      ((cappedCount - 1) / Math.max(MAX_BLEND_INGREDIENTS - 1, 1)) * (1 - LIQUID_FIRST_INGREDIENT_FILL_RATIO)
    : 0;
  const targetLiquidSurfaceY =
    LIQUID_SURFACE_EMPTY_Y - ingredientProgress * (LIQUID_SURFACE_EMPTY_Y - LIQUID_SURFACE_FULL_Y);
  const targetLiquidSurfaceRx = getLiquidSurfaceRadiusX(targetLiquidSurfaceY);
  const targetLiquidSurfaceRy = getLiquidSurfaceRadiusY(targetLiquidSurfaceRx);
  const liquidSurfaceY = hasLiquid
    ? Math.max(targetLiquidSurfaceY, CUP_INNER_TOP_Y + targetLiquidSurfaceRy + LIQUID_SURFACE_TOP_CLEARANCE)
    : targetLiquidSurfaceY;
  const liquidSurfaceRx = getLiquidSurfaceRadiusX(liquidSurfaceY);
  const liquidSurfaceRy = getLiquidSurfaceRadiusY(liquidSurfaceRx);
  const liquidBodyX = 100 - liquidSurfaceRx;
  const liquidBodyWidth = liquidSurfaceRx * 2;

  return (
    <svg viewBox="0 0 200 200" className={className}>
      <defs>
        <clipPath id={clipPathId}>
          <path d="M43,60 Q43,157 100,157 Q157,157 157,60 L43,60 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipPathId})`}>
        {hasLiquid ? (
          <>
            <rect
              x={liquidBodyX}
              y={liquidSurfaceY}
              width={liquidBodyWidth}
              height={CUP_INNER_BOTTOM_Y - liquidSurfaceY + liquidSurfaceRy + 6}
              fill={fillColor}
              opacity="0.78"
            />
            <ellipse
              cx="100"
              cy={liquidSurfaceY}
              rx={liquidSurfaceRx}
              ry={liquidSurfaceRy}
              fill={fillColor}
              opacity="0.9"
            />
          </>
        ) : null}
      </g>
      <path d="M40,60 Q40,160 100,160 Q160,160 160,60" fill="none" stroke="#D4C4A8" strokeWidth="3" />
      <ellipse cx="100" cy="60" rx="60" ry="15" fill="none" stroke="#D4C4A8" strokeWidth="3" />
      <path d="M160,80 Q190,80 190,110 Q190,140 160,140" fill="none" stroke="#D4C4A8" strokeWidth="3" />
    </svg>
  );
}
