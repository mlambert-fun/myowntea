import { useAuth } from '@/context/AuthContext';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { Footer } from '@/sections/Footer';
import { Navigation } from '@/sections/Navigation';
import { t } from '@/lib/i18n';

export default function SubscriptionsLandingPage() {
  const { customer } = useAuth();

  return (
    <>
      <Navigation />
      <section className="min-h-screen bg-[#FAF8F3] pt-28 pb-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 lg:px-12">
          <PageBreadcrumb />

          <div className="relative overflow-hidden rounded-[2.5rem] border border-[#CDAE69] bg-[linear-gradient(145deg,#8F6C2B_0%,var(--gold-antique)_34%,#E9D19A_68%,#F6EFE1_100%)] px-8 py-10 text-[var(--sage-deep)] shadow-[0_32px_90px_rgba(156,124,56,0.22)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 hidden w-[34%] lg:block"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, rgba(246, 239, 225, 0.14) 0%, rgba(246, 239, 225, 0.08) 28%, rgba(246, 239, 225, 0.36) 62%, rgba(246, 239, 225, 0.88) 100%), url('/assets/misc/subscription.webp')",
                backgroundPosition: 'left center, center right',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '100% 100%, cover',
              }}
            />
            <div className="relative z-10">
              <p className="text-xs uppercase tracking-[0.3em] text-[#5F4B1D]/82">
                {t('app.sections.subscriptions_page.hero_kicker')}
              </p>
              <div className="mt-4 grid gap-8 lg:grid-cols-[1.4fr_0.8fr] lg:items-stretch">
                <div>
                  <h1 className="max-w-3xl font-display text-4xl leading-tight text-[#23352E] md:text-5xl">
                    {t('app.sections.subscriptions_page.hero_title')}
                  </h1>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-[#31453C]/85">
                    {t('app.sections.subscriptions_page.hero_body')}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <span className="rounded-full border border-[#D7BC7C] bg-white/55 px-4 py-2 text-xs uppercase tracking-[0.16em] text-[#4C3A14]">
                      {t('app.sections.subscriptions_page.hero_badge_discount')}
                    </span>
                    <span className="rounded-full border border-[#D7BC7C] bg-white/55 px-4 py-2 text-xs uppercase tracking-[0.16em] text-[#4C3A14]">
                      {t('app.sections.subscriptions_page.hero_badge_cadence')}
                    </span>
                    <span className="rounded-full border border-[#D7BC7C] bg-white/55 px-4 py-2 text-xs uppercase tracking-[0.16em] text-[#4C3A14]">
                      {t('app.sections.subscriptions_page.hero_badge_account')}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-4 lg:h-full lg:justify-center lg:pl-8 xl:pl-12">
                  <div className="flex flex-col gap-3 sm:flex-row lg:w-full lg:max-w-[18rem] lg:flex-col">
                    <a
                      href="/creations"
                      className="btn-primary inline-flex items-center justify-center !bg-[var(--sage-deep)] !px-5 !py-3 !text-[var(--cream-apothecary)] hover:!bg-[#31453C]"
                    >
                      {t('app.sections.subscriptions_page.existing_creations_cta')}
                    </a>
                    <a
                      href="/?a=creator"
                      className="btn-primary inline-flex items-center justify-center !bg-[var(--sage-deep)] !px-5 !py-3 !text-[var(--cream-apothecary)] hover:!bg-[#31453C]"
                    >
                      {t('app.sections.subscriptions_page.atelier_cta')}
                    </a>
                  </div>
                  {customer?.email && (
                    <a
                      href="/account/subscriptions"
                      className="inline-flex items-center justify-center rounded-full border border-white/70 bg-white/78 px-4 py-2 text-sm font-medium text-[var(--sage-deep)] shadow-[0_10px_24px_rgba(35,53,46,0.12)] backdrop-blur-md transition-colors hover:bg-white hover:text-[#23352E] lg:max-w-[18rem]"
                    >
                      {t('app.sections.subscriptions_page.manage_my_subscriptions')}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-[2rem] border border-[#E6DCC8] bg-white p-7 shadow-sm">
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--gold-antique)]">
                {t('app.sections.subscriptions_page.card_existing_kicker')}
              </p>
              <h2 className="mt-3 font-display text-3xl text-[var(--sage-deep)]">
                {t('app.sections.subscriptions_page.card_existing_title')}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--sage-deep)]/70">
                {t('app.sections.subscriptions_page.card_existing_body')}
              </p>
              <ul className="mt-5 grid gap-2 text-sm text-[var(--sage-deep)]">
                <li>{t('app.sections.subscriptions_page.card_existing_benefit_one')}</li>
                <li>{t('app.sections.subscriptions_page.card_existing_benefit_two')}</li>
                <li>{t('app.sections.subscriptions_page.card_existing_benefit_three')}</li>
              </ul>
              <a
                href="/creations"
                className="btn-secondary mt-6 inline-flex items-center justify-center !border-[var(--gold-antique)] !px-5 !py-3 !text-[var(--gold-antique)] hover:!bg-[var(--cream-apothecary)] hover:!text-[var(--sage-deep)]"
              >
                {t('app.sections.subscriptions_page.existing_creations_cta')}
              </a>
            </article>

            <article className="rounded-[2rem] border border-[#D9C8AA] bg-[linear-gradient(150deg,#F4EBDD_0%,#FBF7F0_100%)] p-7 shadow-sm">
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--gold-antique)]">
                {t('app.sections.subscriptions_page.card_creator_kicker')}
              </p>
              <h2 className="mt-3 font-display text-3xl text-[var(--sage-deep)]">
                {t('app.sections.subscriptions_page.card_creator_title')}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--sage-deep)]/70">
                {t('app.sections.subscriptions_page.card_creator_body')}
              </p>
              <ul className="mt-5 grid gap-2 text-sm text-[var(--sage-deep)]">
                <li>{t('app.sections.subscriptions_page.card_creator_benefit_one')}</li>
                <li>{t('app.sections.subscriptions_page.card_creator_benefit_two')}</li>
                <li>{t('app.sections.subscriptions_page.card_creator_benefit_three')}</li>
              </ul>
              <a
                href="/?a=creator"
                className="btn-primary mt-6 inline-flex items-center justify-center !bg-[var(--sage-deep)] !px-5 !py-3 !text-[var(--cream-apothecary)] hover:!bg-[#294239]"
              >
                {t('app.sections.subscriptions_page.atelier_cta')}
              </a>
            </article>
          </div>

          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="rounded-[2rem] border border-[#E6DCC8] bg-white p-7 shadow-sm">
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--gold-antique)]">
                {t('app.sections.subscriptions_page.how_it_works_kicker')}
              </p>
              <h2 className="mt-3 font-display text-3xl text-[var(--sage-deep)]">
                {t('app.sections.subscriptions_page.how_it_works_title')}
              </h2>
              <div className="mt-6 grid gap-4">
                <div className="rounded-2xl bg-[var(--cream-apothecary)] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--gold-antique)]">01</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--sage-deep)]">
                    {t('app.sections.subscriptions_page.step_one')}
                  </p>
                </div>
                <div className="rounded-2xl bg-[var(--cream-apothecary)] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--gold-antique)]">02</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--sage-deep)]">
                    {t('app.sections.subscriptions_page.step_two')}
                  </p>
                </div>
                <div className="rounded-2xl bg-[var(--cream-apothecary)] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--gold-antique)]">03</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--sage-deep)]">
                    {t('app.sections.subscriptions_page.step_three')}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-[#E6DCC8] bg-white p-7 shadow-sm">
              <p className="text-xs uppercase tracking-[0.26em] text-[var(--gold-antique)]">
                {t('app.sections.subscriptions_page.faq_kicker')}
              </p>
              <h2 className="mt-3 font-display text-3xl text-[var(--sage-deep)]">
                {t('app.sections.subscriptions_page.faq_title')}
              </h2>
              <div className="mt-6 grid gap-4">
                <div className="rounded-2xl border border-[#EEE6D8] p-4">
                  <h3 className="font-medium text-[var(--sage-deep)]">
                    {t('app.sections.subscriptions_page.faq_one_title')}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--sage-deep)]/70">
                    {t('app.sections.subscriptions_page.faq_one_body')}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#EEE6D8] p-4">
                  <h3 className="font-medium text-[var(--sage-deep)]">
                    {t('app.sections.subscriptions_page.faq_two_title')}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--sage-deep)]/70">
                    {t('app.sections.subscriptions_page.faq_two_body')}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#EEE6D8] p-4">
                  <h3 className="font-medium text-[var(--sage-deep)]">
                    {t('app.sections.subscriptions_page.faq_three_title')}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--sage-deep)]/70">
                    {t('app.sections.subscriptions_page.faq_three_body')}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
