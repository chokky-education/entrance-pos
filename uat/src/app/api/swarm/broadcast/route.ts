import { pushActivity } from "@/lib/activity";
import { bad, guard, ok } from "@/lib/api";
import { enqueueWebCommand, listWebCommands } from "@/lib/sml-foundation";
import { BroadcastRequest } from "@/types/bot";

export const GET = () =>
  guard(async () => ok({ commands: listWebCommands().slice(0, 12) }));

// สั่งงานตรวจ: ตอบรับทันที บันทึกเข้าคิวให้ Gemini เป็นผู้สร้างสคริปต์ทดสอบจากโค้ดจริงและสั่ง UAT รันหลายหน้าจอพร้อมกัน
export const POST = (req: Request) =>
  guard(async () => {
    const { targetBotIds, prompt }: BroadcastRequest = await req.json();
    if (typeof prompt !== "string" || !prompt.trim()) return bad("กรุณาพิมพ์คำสั่งว่าจะให้ตรวจอะไร");
    const cmd = prompt.trim();
    const entry = enqueueWebCommand(cmd, targetBotIds);
    const head = `"${cmd.slice(0, 80)}${cmd.length > 80 ? "…" : ""}"`;
    pushActivity({
      kind: "note",
      client: "ระบบสั่งงาน",
      status: "sending",
      text: `รับคำสั่งหน้าเว็บ ${head} (${entry.id}) แล้ว — ส่งให้ Gemini สร้างสคริปต์ทดสอบและรันหลายหน้าจอพร้อมกัน`,
    });
    return ok({ message: "รับคำสั่งแล้ว — Gemini กำลังสร้างสคริปต์ทดสอบและส่งรันหลายหน้าจอพร้อมกัน", command: entry });
  });
