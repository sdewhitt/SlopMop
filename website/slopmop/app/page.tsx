import Navbar from "./components/navbar";
import FeaturesSection from "./components/features-section";
import Hero from "./components/hero";
import PurposeSection from "./components/purpose-section";
import InstallStepsSection from "./components/install-steps-section";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
        <Navbar />

        <Hero />

        <FeaturesSection />

        <PurposeSection />

        <InstallStepsSection />
    </div>
  );
}
