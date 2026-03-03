import { cn } from '@/lib/utils';

type LoaderSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<
  LoaderSize,
  {
    badge: string;
    spinner: string;
    spacing: string;
  }
> = {
  xs: {
    badge: 'h-6 w-6',
    spinner: 'h-2.5 w-2.5',
    spacing: 'mb-1',
  },
  sm: {
    badge: 'h-10 w-10',
    spinner: 'h-4 w-4',
    spacing: 'mb-2',
  },
  md: {
    badge: 'h-14 w-14',
    spinner: 'h-6 w-6',
    spacing: 'mb-3',
  },
  lg: {
    badge: 'h-20 w-20',
    spinner: 'h-8 w-8',
    spacing: 'mb-6',
  },
};

export function CartLoaderIcon({ size = 'md', className }: { size?: LoaderSize; className?: string }) {
  const classes = SIZE_CLASSES[size];
  return (
    <div className={cn('inline-flex items-center justify-center rounded-full bg-white shadow', classes.badge, className)}>
      <div
        className={cn(
          'rounded-full border-2 border-[var(--sage-deep)]/20 border-t-[var(--sage-deep)] animate-spin',
          classes.spinner
        )}
      />
    </div>
  );
}

export function DataLoadingState({
  title = 'Chargement...',
  description,
  size = 'md',
  className,
  titleClassName,
  descriptionClassName,
}: {
  title?: string;
  description?: string;
  size?: LoaderSize;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}) {
  const classes = SIZE_CLASSES[size];
  return (
    <div className={cn('text-center', className)}>
      <CartLoaderIcon size={size} className={cn('mx-auto', classes.spacing)} />
      {title ? <p className={cn('text-[var(--sage-deep)]/70', titleClassName)}>{title}</p> : null}
      {description ? <p className={cn('mt-1 text-[var(--sage-deep)]/60', descriptionClassName)}>{description}</p> : null}
    </div>
  );
}

export function InlineLoading({
  label = 'Chargement...',
  className,
  textClassName,
  size = 'xs',
}: {
  label?: string;
  className?: string;
  textClassName?: string;
  size?: LoaderSize;
}) {
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <CartLoaderIcon size={size} className="shrink-0" />
      <span className={cn('text-[var(--sage-deep)]/60', textClassName)}>{label}</span>
    </div>
  );
}
