import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-thai",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3005";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "DOME Pos — ระบบขายหน้าร้านกาแฟ เบียร์ คาเฟ่ย์ (สำหรับเจ้าของร้านทำคนเดียว)",
    template: "%s | DOME Pos",
  },
  description:
    "DOME Pos ระบบขายหน้าร้าน (POS) สำหรับร้านกาแฟ มัทฉะ คราฟต์เบียร์ เบเกอรี่ และคาเฟ่ย์ ออกแบบเพื่อเจ้าของร้านคนเดียว ทำงานคนเดียว ขายด่วน 1-Click พักบิลตามโต๊ะ จอคิวบาริสต้า สะสมแต้ม Wallet และปิดกะแม่นยำ 100%",
  keywords: [
    "DOME Pos",
    "ระบบขายหน้าร้าน",
    "POS ร้านกาแฟ",
    "POS คราฟต์เบียร์",
    "POS คาเฟ่",
    "เจ้าของร้านคนเดียว",
    "ระบบคิดเงินคาเฟ่",
  ],
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    type: "website",
    locale: "th_TH",
    url: SITE_URL,
    siteName: "DOME Pos",
    title: "DOME Pos — ระบบขายหน้าร้านกาแฟ เบียร์ คาเฟ่ย์ (สำหรับเจ้าของร้านทำคนเดียว)",
    description:
      "เข้าใช้งานได้ทันที ไม่ต้องล็อกอินซับซ้อน ขายด่วนรับเงินสดพอดีใน 1 คลิก เพิ่มเมนูเองได้ง่าย พร้อมจอคิวบาริสต้าและรายงานปิดกะ",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const jsonLdData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "DOME Pos",
    url: SITE_URL,
    description:
      "ผู้พัฒนาระบบขายหน้าร้าน DOME Pos สำหรับร้านกาแฟ คราฟต์เบียร์ และคาเฟ่ย์ที่ดูแลโดยเจ้าของคนเดียว",
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "DOME Pos",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android, Windows, macOS",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "THB",
    },
    description:
      "ระบบขายหน้าร้านกาแฟ เบียร์ คาเฟ่ย์ สำหรับเจ้าของร้านทำคนเดียว รองรับ 1-Click ขายด่วน ผังโต๊ะ จอคิวบาริสต้า KDS และสะสมแต้ม Wallet",
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "DOME Pos หน้าหลัก",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "หน้าจอขายหน้าร้าน (POS)",
        item: `${SITE_URL}/pos`,
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "DOME Pos เหมาะกับร้านแบบไหน?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "เหมาะสำหรับร้านกาแฟสด ร้านชาเขียวมัทฉะ บาร์คราฟต์เบียร์ ร้านเบเกอรี่ และคาเฟ่ย์ที่เจ้าของร้านดูแลเองคนเดียว ต้องการความรวดเร็วสูงสุดโดยไม่ต้องล็อกอินหลายขั้นตอน",
        },
      },
      {
        "@type": "Question",
        name: "ปุ่มรับเงินสดพอดี (1-Click ขายด่วน) ทำงานอย่างไร?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "เมื่อเลือกเมนูลงตะกร้าแล้ว กดปุ่มรับเงินสดพอดีเพียงปุ่มเดียว ระบบจะตั้งยอดรับเงินสดเท่ากับยอดสุทธิ บันทึกบิล ส่งคิวเข้าจอบาริสต้า และออกใบเสร็จทันที",
        },
      },
    ],
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={notoSansThai.variable}>
      <body className="antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData) }}
        />
        {children}
      </body>
    </html>
  );
}
