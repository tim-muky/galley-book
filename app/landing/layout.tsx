import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Galley Book — Save recipes from everywhere. Take them wherever you go.",
  description:
    "Import any recipe from Instagram, YouTube, TikTok, or any website in seconds. Galley Book keeps your whole collection beautifully organised — always with you.",
  openGraph: {
    title: "Galley Book — Save recipes from everywhere.",
    description:
      "Import any recipe from Instagram, YouTube, TikTok, or any website in seconds. Always with you.",
    url: "https://www.galleybook.com",
    siteName: "Galley Book",
    type: "website",
  },
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link rel="preload" href="/landing-bg.webp" as="image" type="image/webp" />
      {children}
    </>
  );
}
