import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Galley Book — Your Family's Culinary Gallery",
  description:
    "A private recipe library for the people you cook for. Save from Instagram, YouTube, and anywhere on the web.",
  openGraph: {
    title: "Galley Book — Your Family's Culinary Gallery",
    description:
      "A private recipe library for the people you cook for.",
    url: "https://www.galleybook.com",
    siteName: "Galley Book",
    type: "website",
  },
};

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {META_PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}
      {children}
    </>
  );
}
