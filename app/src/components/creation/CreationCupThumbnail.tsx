import { RotateCcw } from 'lucide-react';
import { CreationCupLogo } from '@/components/creation/CreationCupLogo';

interface CreationCupThumbnailProps {
  fillColor: string;
  ingredientCount?: number;
  recurring?: boolean;
  containerClassName?: string;
  cupClassName?: string;
  badgeClassName?: string;
  badgeIconClassName?: string;
}

export function CreationCupThumbnail({
  fillColor,
  ingredientCount = 0,
  recurring = false,
  containerClassName = 'h-16 w-16 shrink-0 rounded-xl bg-[#F3F1EE] p-1.5',
  cupClassName = 'h-full w-full',
  badgeClassName = 'absolute bottom-0 right-0 z-10 flex h-5 w-5 translate-x-1/4 translate-y-1/4 items-center justify-center rounded-full border-2 border-white bg-[var(--sage-deep)] text-white shadow-sm',
  badgeIconClassName = 'h-3.5 w-3.5 stroke-[2.25]',
}: CreationCupThumbnailProps) {
  return (
    <div className={`relative overflow-visible ${containerClassName}`}>
      <CreationCupLogo fillColor={fillColor} ingredientCount={ingredientCount} className={cupClassName} />
      {recurring && (
        <span className={badgeClassName}>
          <RotateCcw className={badgeIconClassName} />
        </span>
      )}
    </div>
  );
}
