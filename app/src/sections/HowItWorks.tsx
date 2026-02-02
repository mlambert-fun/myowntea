import { useEffect, useRef, useState } from 'react';
import { Leaf, Beaker, Package, Truck } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: Leaf,
    title: 'Sélectionnez Vos Ingrédients',
    description: 'Parcourez notre collection de 40+ ingrédients bio soigneusement sourcés. Choisissez votre base, ajoutez des fleurs, des fruits, des plantes et des arômes selon vos envies.',
    color: '#7C9A6B'
  },
  {
    number: '02',
    icon: Beaker,
    title: 'Créez Votre Mélange',
    description: 'Notre assistant intelligent vous guide pour créer une harmonie parfaite. Jusqu\'à 10 ingrédients pour un équilibre optimal de saveurs et de bienfaits.',
    color: '#C9A962'
  },
  {
    number: '03',
    icon: Package,
    title: 'Personnalisez Votre Packaging',
    description: 'Donnez un nom unique à votre création. Chaque mélange est préparé à la main et emballé dans un sachet élégant avec votre étiquette personnalisée.',
    color: '#B8A9C9'
  },
  {
    number: '04',
    icon: Truck,
    title: 'Recevez Votre Création',
    description: 'Livraison rapide et soignée chez vous ou offrez-le à un proche. Votre mélange signature, prêt à être dégusté et partagé.',
    color: '#E8B4B8'
  }
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visibleSteps, setVisibleSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const index = parseInt(entry.target.getAttribute('data-index') || '0');
          if (entry.isIntersecting) {
            setVisibleSteps(prev => new Set([...prev, index]));
          }
        });
      },
      { threshold: 0.3, rootMargin: '0px 0px -50px 0px' }
    );

    const stepElements = sectionRef.current?.querySelectorAll('[data-index]');
    stepElements?.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section 
      ref={sectionRef}
      className="relative w-full bg-[#FAF8F3] py-24 overflow-hidden"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-20 left-10 w-32 h-32 border border-[var(--sage-deep)] rounded-full" />
        <div className="absolute top-40 right-20 w-24 h-24 border border-[var(--sage-deep)] rounded-full" />
        <div className="absolute bottom-32 left-1/4 w-16 h-16 border border-[var(--sage-deep)] rounded-full" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="text-center mb-20">
          <span className="inline-block text-sm uppercase tracking-[3px] text-[var(--gold-antique)] font-medium mb-4">
            Comment Ça Marche
          </span>
          <h2 className="font-display text-4xl md:text-5xl text-[var(--sage-deep)] mb-4">
            De L'Idée à <span className="italic">Votre Tasse</span>
          </h2>
          <p className="text-[var(--sage-deep)]/60 max-w-xl mx-auto">
            Quatre étapes simples pour créer le thé de vos rêves, 
            préparé avec soin et expédié directement chez vous.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting Line */}
          <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-[var(--gold-antique)] via-[var(--gold-antique)]/50 to-transparent hidden md:block" />

          <div className="space-y-16 md:space-y-24">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isEven = index % 2 === 0;
              const isVisible = visibleSteps.has(index);

              return (
                <div 
                  key={step.number}
                  data-index={index}
                  className={`relative grid md:grid-cols-2 gap-8 items-center transition-all duration-700 ${
                    isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
                  }`}
                >
                  {/* Content */}
                  <div className={`${isEven ? 'md:pr-16 md:text-right' : 'md:order-2 md:pl-16'}`}>
                    <div className={`inline-flex items-center gap-3 mb-4 ${isEven ? 'md:flex-row-reverse' : ''}`}>
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: step.color + '20' }}
                      >
                        <Icon className="w-6 h-6" style={{ color: step.color }} />
                      </div>
                      <span 
                        className="font-display text-5xl font-bold"
                        style={{ color: step.color + '40' }}
                      >
                        {step.number}
                      </span>
                    </div>
                    <h3 className="font-display text-2xl text-[var(--sage-deep)] mb-3">
                      {step.title}
                    </h3>
                    <p className="text-[var(--sage-deep)]/60 leading-relaxed">
                      {step.description}
                    </p>
                  </div>

                  {/* Visual */}
                  <div className={`${isEven ? 'md:order-2' : 'md:order-1'}`}>
                    <div 
                      className="relative aspect-[4/3] rounded-2xl overflow-hidden group"
                      style={{ backgroundColor: step.color + '15' }}
                    >
                      {/* Abstract Shape */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div 
                          className="w-32 h-32 rounded-full transition-transform duration-500 group-hover:scale-110"
                          style={{ backgroundColor: step.color + '30' }}
                        />
                        <div 
                          className="absolute w-20 h-20 rounded-full"
                          style={{ backgroundColor: step.color + '50' }}
                        />
                        <Icon 
                          className="absolute w-12 h-12 text-white" 
                          style={{ color: step.color }}
                        />
                      </div>

                      {/* Decorative Elements */}
                      <div 
                        className="absolute top-4 left-4 w-8 h-8 rounded-full opacity-50"
                        style={{ backgroundColor: step.color + '40' }}
                      />
                      <div 
                        className="absolute bottom-8 right-8 w-12 h-12 rounded-full opacity-30"
                        style={{ backgroundColor: step.color + '30' }}
                      />
                    </div>
                  </div>

                  {/* Timeline Dot */}
                  <div className="absolute left-8 md:left-1/2 top-1/2 -translate-y-1/2 md:-translate-x-1/2 hidden md:block">
                    <div 
                      className="w-4 h-4 rounded-full border-4 border-white shadow-lg"
                      style={{ backgroundColor: step.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-20">
          <a 
            href="#creator"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('creator')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="btn-primary inline-flex items-center gap-2"
          >
            Commencer Ma Création
          </a>
        </div>
      </div>
    </section>
  );
}
