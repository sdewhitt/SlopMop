import Navbar from "./components/navbar";
import FeaturesSection from "./components/features-section";
import Hero from "./components/hero";
import FAQSection from "./components/faq-section";
import Footer from "./components/footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
        <Navbar />

        <Hero />

        <FeaturesSection />

        <FAQSection />

        <Footer />
    </div>
  );
}
