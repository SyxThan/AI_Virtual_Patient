import PageShell from "@/components/ui/PageShell";
import HeroTile from "@/components/landing/HeroTile";
import FeatureTiles from "@/components/landing/FeatureTiles";
import HowItWorks from "@/components/landing/HowItWorks";
import LandingNotices from "@/components/landing/LandingNotices";

export default function Home() {
  return (
    <PageShell width="wide">
      {/* Bento: hero spans 4 of 6 columns and two rows on desktop; one column on phones. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <HeroTile />
        <FeatureTiles />
      </div>
      <HowItWorks />
      <LandingNotices />
    </PageShell>
  );
}
