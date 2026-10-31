import { DomePosScreen } from "@/components/DomePosScreen";

export default function HomePage() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-[#F4F6F9]">
      <h1 className="sr-only">
        DOME Pos — ระบบขายหน้าร้านกาแฟ เบียร์ คาเฟ่ย์ (สำหรับเจ้าของร้านทำคนเดียว)
      </h1>
      <DomePosScreen />
    </main>
  );
}
