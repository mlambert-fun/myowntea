import { normalizeCountryCode } from '@/lib/phone';
import { cn } from '@/lib/utils';

const FLAG_ICON_MODULES = import.meta.glob('../../../node_modules/flag-icons/flags/4x3/{ad,al,am,at,az,ba,be,bg,by,ch,cy,cz,de,dk,ee,es,fi,fr,gb,ge,gr,hr,hu,ie,is,it,li,lt,lu,lv,mc,md,me,mk,mt,nl,no,pl,pt,ro,rs,ru,se,si,sk,sm,tr,ua,va,xk}.svg', {
    eager: true,
    import: 'default',
}) as Record<string, string>;

const FLAG_ICON_URLS = Object.fromEntries(Object.entries(FLAG_ICON_MODULES).map(([path, url]) => {
    const match = path.match(/([a-z]{2})\.svg$/i);
    return [match ? match[1].toUpperCase() : path, String(url)];
})) as Record<string, string>;

export function FlagIcon({
    code,
    className,
}: {
    code: string;
    className?: string;
}) {
    const normalizedCode = normalizeCountryCode(code).toLowerCase();
    const flagUrl = FLAG_ICON_URLS[normalizedCode.toUpperCase()];
    if (!normalizedCode || !flagUrl) {
        return <span className={className}/>;
    }
    return (<span className={cn('grid place-items-center overflow-hidden rounded-[0.25rem] border border-[#E8DED0] bg-[#FFFDF8] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_2px_8px_rgba(65,76,22,0.08)]', className)}>
      <img src={flagUrl} alt="" aria-hidden="true" className="block h-full w-full object-cover"/>
    </span>);
}
