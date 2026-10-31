import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DOME Pos UAT Tester — ระบบทดสอบอัตโนมัติร้านกาแฟ · เบียร์ · คาเฟ่ย์",
  description: "ทดสอบระบบ DOME Pos (โหมดเจ้าของคนเดียว ทำงานคนเดียว) ตามสคริปต์ทีละขั้นตอน ทั้งหน้าจอ API และฐานข้อมูล PostgreSQL (domepos)",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#04060f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className="dark">
      <body className="min-h-screen overflow-x-hidden antialiased">
        <div className="stage" aria-hidden>
          <div className="aurora a1" />
          <div className="aurora a2" />
          <div className="aurora a3" />
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
