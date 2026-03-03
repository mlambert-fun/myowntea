export type BlendFormatCode = 'POUCH_100G' | 'MUSLIN_20';

export const DEFAULT_BLEND_FORMAT: BlendFormatCode = 'POUCH_100G';

export const BLEND_FORMAT_LABELS: Record<BlendFormatCode, string> = {
  POUCH_100G: 'Pochette vrac 100g',
  MUSLIN_20: 'Sachets mousselines x20',
};

export const BLEND_FORMAT_OPTIONS: Array<{ code: BlendFormatCode; label: string }> = [
  { code: 'POUCH_100G', label: BLEND_FORMAT_LABELS.POUCH_100G },
  { code: 'MUSLIN_20', label: BLEND_FORMAT_LABELS.MUSLIN_20 },
];

export const normalizeBlendFormat = (value: unknown): BlendFormatCode => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  if (
    normalized === 'MUSLIN_20' ||
    normalized === 'SACHETS_MOUSSELINES_X20' ||
    normalized === 'SACHETS_MOUSSELINE_X20'
  ) {
    return 'MUSLIN_20';
  }

  return 'POUCH_100G';
};

export const getBlendFormatLabel = (value: unknown): string =>
  BLEND_FORMAT_LABELS[normalizeBlendFormat(value)];
