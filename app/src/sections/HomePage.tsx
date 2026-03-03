import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Navigation } from './Navigation';
import { Hero } from './Hero';
import { Creator } from './Creator';
import { HowItWorks } from './HowItWorks';
import { TopCreations } from './TopCreations';
import { AccessoriesHome } from './AccessoriesHome';
import { Testimonials } from './Testimonials';
import { Footer } from './Footer';

export default function HomePage() {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const scrollTo = params.get('scroll');
    if (scrollTo) {
      const el = document.getElementById(scrollTo);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [location.search]);

  return (
    <>
      <Navigation />
      <main>
        <Hero />
        <Creator />
        <section id="how-it-works">
          <HowItWorks />
        </section>
        <section id="topcreations">
          <TopCreations />
        </section>
        <AccessoriesHome />
        <section id="testimonials">
          <Testimonials />
        </section>
      </main>
      <Footer />
    </>
  );
}
