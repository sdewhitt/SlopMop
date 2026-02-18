import Navbar from "./components/navbar";
import Footer from "./components/footer";
import FeaturesSection from "./components/features-section";
import Hero from "./components/hero";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
        <Navbar />

        <Hero />

        <FeaturesSection />

        <Footer />
    </div>
  );
}
