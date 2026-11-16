import PageShell from "@/components/ui/PageShell";
import HeroTile from "@/components/landing/HeroTile";
import FeatureTiles from "@/components/landing/FeatureTiles";
import HowItWorks from "@/components/landing/HowItWorks";
import LandingNotices from "@/components/landing/LandingNotices";
import RevealObserver from "@/components/motion/RevealObserver";

export default function Home() {
  return (
    <PageShell width="wide">
      {/* Bento: the hero stage spans all 6 columns; feature cells fill the rows below; one column on phones. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <HeroTile />
        <FeatureTiles />
      </div>
      <HowItWorks />
      {/* The clinical notices and device requirements stay static (no reveal). */}
      <LandingNotices />
      <RevealObserver />
    </PageShell>
  );
}
