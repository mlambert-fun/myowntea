import { BlendProvider } from '@/context/BlendContext';
import { Navigation } from '@/sections/Navigation';
import { Hero } from '@/sections/Hero';
import { Creator } from '@/sections/Creator';
import { IngredientsGallery } from '@/sections/IngredientsGallery';
import { HowItWorks } from '@/sections/HowItWorks';
import { Testimonials } from '@/sections/Testimonials';
import { Footer } from '@/sections/Footer';

function App() {
  return (
    <BlendProvider>
      <div className="min-h-screen bg-[var(--cream-apothecary)]">
        <Navigation />
        <main>
          <Hero />
          <Creator />
          <section id="gallery">
            <IngredientsGallery />
          </section>
          <section id="how-it-works">
            <HowItWorks />
          </section>
          <section id="testimonials">
            <Testimonials />
          </section>
        </main>
        <Footer />
      </div>
    </BlendProvider>
  );
}

export default App;
