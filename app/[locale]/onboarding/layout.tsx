import Image from "next/image";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-white">
      <Image
        src="/onboarding-bg.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover opacity-50 pointer-events-none select-none"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
