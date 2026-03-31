import type { ReactNode } from 'react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { t } from "@/lib/i18n";
type InfoSection = {
    title: string;
    paragraphs?: string[];
    bullets?: string[];
    extra?: ReactNode;
};
type InfoPageLayoutProps = {
    title: string;
    intro: string;
    updatedAt: string;
    sections: InfoSection[];
};
export function InfoPageLayout({ title, intro, updatedAt, sections }: InfoPageLayoutProps) {
    return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="mx-auto max-w-4xl px-6">
          <PageBreadcrumb />
          <article className="rounded-2xl border border-[#E5E0D5] bg-white p-7 shadow-sm sm:p-10">
            <header className="border-b border-[#EEE6D8] pb-5">
              <h1 className="font-display text-3xl text-[var(--sage-deep)]">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-[var(--sage-deep)]/75">{intro}</p>
              <p className="mt-3 text-xs text-[var(--sage-deep)]/55">{t("app.sections.info_page_layout.last_update_day")}{updatedAt}</p>
            </header>

            <div className="mt-7 space-y-8">
              {sections.map((section) => (<section key={section.title} className="space-y-3">
                  <h2 className="font-display text-xl text-[var(--sage-deep)]">{section.title}</h2>
                  {(section.paragraphs || []).map((paragraph, index) => (<p key={`${section.title}-p-${index}`} className="text-sm leading-6 text-[var(--sage-deep)]/80">
                      {paragraph}
                    </p>))}
                  {(section.bullets || []).length > 0 && (<ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--sage-deep)]/80">
                      {(section.bullets || []).map((item, index) => (<li key={`${section.title}-b-${index}`}>{item}</li>))}
                    </ul>)}
                  {section.extra}
                </section>))}
            </div>
          </article>
        </div>
      </main>
      <Footer />
    </div>);
}

