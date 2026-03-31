import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Quote, Star } from 'lucide-react';
import { t } from "@/lib/i18n";
interface Testimonial {
    id: number;
    name: string;
    role: string;
    content: string;
    rating: number;
    blend: string;
    slug: string;
    avatar: string;
}
const testimonials: Testimonial[] = [
    {
        id: 1,
        name: 'Claire D.',
        role: t("app.sections.testimonials.amatrice_tea"),
        content: t("app.sections.testimonials.experience_unique_created"),
        rating: 5,
        blend: t("app.sections.testimonials.reveil_provence"),
        slug: 'reveil-en-provence',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop'
    },
    {
        id: 2,
        name: "Marc L.",
        role: t("app.sections.testimonials.chef"),
        content: t("app.sections.testimonials.qualite_ingredients_exceptionnelle"),
        rating: 5,
        blend: t("app.sections.testimonials.epices_orient"),
        slug: 'epices-d-orient',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop'
    },
    {
        id: 3,
        name: 'Sophie M.',
        role: t("app.sections.testimonials.yoga_teacher"),
        content: t("app.sections.testimonials.my_melange_serenite"),
        rating: 5,
        blend: t("app.sections.testimonials.serenite"),
        slug: 'serenite',
        avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop'
    },
    {
        id: 4,
        name: 'Pierre B.',
        role: t("app.sections.testimonials.entrepreneur"),
        content: t("app.sections.testimonials.offert_melange_personnalise"),
        rating: 5,
        blend: t("app.sections.testimonials.energie_collective"),
        slug: 'energie-collective',
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop'
    },
    {
        id: 5,
        name: "Emilie R.",
        role: t("app.sections.testimonials.etudiante"),
        content: t("app.sections.testimonials.price_raisonnable_qualite"),
        rating: 5,
        blend: t("app.sections.testimonials.concentration_max"),
        slug: 'concentration-max',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop'
    }
];
export function Testimonials({ ingredientCountLabel = '40+' }: { ingredientCountLabel?: string }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAutoPlaying, setIsAutoPlaying] = useState(true);
    useEffect(() => {
        if (!isAutoPlaying)
            return;
        const interval = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % testimonials.length);
        }, 5000);
        return () => clearInterval(interval);
    }, [isAutoPlaying]);
    const goToPrevious = () => {
        setIsAutoPlaying(false);
        setCurrentIndex(prev => (prev - 1 + testimonials.length) % testimonials.length);
    };
    const goToNext = () => {
        setIsAutoPlaying(false);
        setCurrentIndex(prev => (prev + 1) % testimonials.length);
    };
    return (<section className="relative w-full bg-[var(--sage-deep)] py-24 overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-[var(--gold-antique)]/5 rounded-full -translate-x-1/2 -translate-y-1/2"/>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[var(--gold-antique)]/5 rounded-full translate-x-1/3 translate-y-1/3"/>

      <div className="relative z-10 max-w-5xl mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="inline-block text-sm uppercase tracking-[3px] text-[var(--gold-antique)] font-medium mb-4">{t("app.sections.testimonials.temoignages")}</span>
          <h2 className="font-display text-4xl md:text-5xl text-[var(--cream-apothecary)] mb-4">{t("app.sections.testimonials.ils_ont_created")} <span className="italic text-[var(--gold-antique)]">Leur Signature</span>
          </h2>
        </div>

        {/* Testimonial Card */}
        <div className="relative">
          {/* Quote Icon */}
          <Quote className="absolute -top-6 left-0 w-16 h-16 text-[var(--gold-antique)]/20"/>

          <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 md:p-12">
            <div className="grid md:grid-cols-[1fr,auto] gap-8 items-center">
              {/* Content */}
              <div>
                {/* Stars */}
                <div className="flex gap-1 mb-6">
                  {Array.from({ length: 5 }).map((_, i) => (<Star key={i} className={`w-5 h-5 ${i < testimonials[currentIndex].rating
                ? 'fill-[var(--gold-antique)] text-[var(--gold-antique)]'
                : 'text-[var(--cream-apothecary)]/30'}`}/>))}
                </div>

                {/* Quote */}
                <blockquote className="font-display text-xl md:text-2xl text-[var(--cream-apothecary)] leading-relaxed mb-8">
                  "{testimonials[currentIndex].content}"
                </blockquote>

                {/* Author */}
                <div className="flex items-center gap-4">
                  <img
                    src={testimonials[currentIndex].avatar}
                    alt={testimonials[currentIndex].name}
                    loading="lazy"
                    decoding="async"
                    className="w-14 h-14 rounded-full object-cover border-2 border-[var(--gold-antique)]"
                  />
                  <div>
                    <div className="font-medium text-[var(--cream-apothecary)]">
                      {testimonials[currentIndex].name}
                    </div>
                    <div className="text-sm text-[var(--gold-antique)]">
                      {testimonials[currentIndex].role}
                    </div>
                  </div>
                </div>

                {/* Blend Name */}
                <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-[var(--gold-antique)]/20 rounded-full">
                  <span className="text-xs text-[var(--gold-antique)] uppercase tracking-wide">{t("app.sections.testimonials.melange_created")}</span>
                  <a href={`/creations/${testimonials[currentIndex].slug}`} className="text-sm font-medium text-[var(--cream-apothecary)] hover:underline underline-offset-2">
                    {testimonials[currentIndex].blend}
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            {/* Dots */}
            <div className="flex gap-2">
              {testimonials.map((_, index) => (<button key={index} onClick={() => {
                setIsAutoPlaying(false);
                setCurrentIndex(index);
            }} className={`w-2 h-2 rounded-full transition-all duration-300 ${index === currentIndex
                ? 'w-8 bg-[var(--gold-antique)]'
                : 'bg-[var(--cream-apothecary)]/30 hover:bg-[var(--cream-apothecary)]/50'}`}/>))}
            </div>

            {/* Arrows */}
            <div className="flex gap-3">
              <button onClick={goToPrevious} className="p-3 border border-[var(--cream-apothecary)]/30 rounded-full text-[var(--cream-apothecary)] hover:bg-[var(--cream-apothecary)]/10 transition-colors">
                <ChevronLeft className="w-5 h-5"/>
              </button>
              <button onClick={goToNext} className="p-3 border border-[var(--cream-apothecary)]/30 rounded-full text-[var(--cream-apothecary)] hover:bg-[var(--cream-apothecary)]/10 transition-colors">
                <ChevronRight className="w-5 h-5"/>
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16">
          {[
            { value: '5,000+', label: t("app.sections.testimonials.melanges_crees") },
            { value: '4.9/5', label: 'Note moyenne' },
            { value: '98%', label: 'Clients satisfaits' },
            { value: ingredientCountLabel, label: t("app.sections.testimonials.ingredients_bio") }
        ].map((stat, index) => (<div key={index} className="text-center">
              <div className="font-display text-3xl md:text-4xl text-[var(--gold-antique)] mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-[var(--gold-antique)]">
                {stat.label}
              </div>
            </div>))}
        </div>
      </div>
    </section>);
}
