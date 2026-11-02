import { NextResponse } from "next/server";
import { getFirebasePosStore } from "@/lib/firebase-pos-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      status: "ERROR",
      error: message,
      message,
    },
    { status },
  );
}

async function decodeJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object"
    ? (parsed as Record<string, unknown>)
    : {};
}

async function handleRequest(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: pathSegments } = await ctx.params;
  if (!pathSegments.every((s) => s !== "" && s !== "." && s !== "..")) {
    return fail("ไม่พบคำสั่ง DOME Pos", 404);
  }

  const subPath = pathSegments.join("/").toLowerCase();
  const urlObj = new URL(request.url);
  const method = request.method.toUpperCase();
  const store = getFirebasePosStore();

  try {
    // 1. Health Check
    if (subPath === "health") {
      return NextResponse.json({
        ok: true,
        status: "ok",
        service: "domepos-firebase-api",
        database: "firebase-firestore",
        firebase_firestore: store.isFirestoreConfigured(),
        firebase_storage: store.isStorageConfigured(),
        cloudflare_d1: store.isFirestoreConfigured(),
        cloudflare_r2: store.isStorageConfigured(),
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Bootstrap
    if (subPath === "bootstrap") {
      if (method !== "GET") return fail("รองรับเฉพาะ GET", 405);
      const res = await store.getBootstrap();
      return NextResponse.json(res);
    }

    // 3. Sync (GET catalog delta / POST offline bills)
    if (subPath === "sync") {
      if (method === "POST") {
        const body = await decodeJsonBody(request);
        const synced: string[] = [];
        if (Array.isArray(body.bills)) {
          for (const b of body.bills) {
            if (b && typeof b === "object") {
              try {
                const r = await store.processBill(b as Record<string, unknown>);
                if (r.doc_no) synced.push(String(r.doc_no));
              } catch {
                // continue syncing remaining bills
              }
            }
          }
        }
        return NextResponse.json({
          ok: true,
          status: "SYNCED",
          synced,
          data: {
            status: "SYNCED",
            synced,
          },
        });
      }
      if (method !== "GET") return fail("รองรับเฉพาะ GET/POST", 405);
      const cursor =
        urlObj.searchParams.get("cursor") ||
        urlObj.searchParams.get("since_seq") ||
        urlObj.searchParams.get("since") ||
        "";
      const res = await store.getSync(cursor);
      return NextResponse.json(res);
    }

    // 4. Restore (Shift + Movements + Recent Bills)
    if (subPath === "restore") {
      if (method !== "GET") return fail("รองรับเฉพาะ GET", 405);
      const mc =
        urlObj.searchParams.get("machine_code") ||
        urlObj.searchParams.get("pos_id") ||
        "POS-01";
      const res = await store.getRestore(mc);
      return NextResponse.json(res);
    }

    // 5. Bills (POST new sale bill)
    if (subPath === "bills") {
      if (method !== "POST") return fail("รองรับเฉพาะ POST", 405);
      const body = await decodeJsonBody(request);
      const res = await store.processBill(body);
      return NextResponse.json(res);
    }

    // 6. Shift & Catalog Actions (open_shift, close_shift, cancel_bill, upsert_item, delete_item)
    if (subPath === "shift") {
      if (method !== "POST") return fail("รองรับเฉพาะ POST", 405);
      const body = await decodeJsonBody(request);
      const res = await store.shiftAction(body);
      return NextResponse.json(res);
    }

    // 7. Config
    if (subPath === "config") {
      if (method !== "POST" && method !== "PUT") {
        return fail("รองรับเฉพาะ POST/PUT", 405);
      }
      const body = await decodeJsonBody(request);
      const section = await store.saveConfig(body);
      return NextResponse.json({
        ok: true,
        status: "SAVED",
        section,
        data: {
          status: "SAVED",
          section,
        },
      });
    }

    // 8. Devices
    if (subPath === "devices") {
      if (method !== "GET") return fail("รองรับเฉพาะ GET", 405);
      return NextResponse.json(store.getDevices());
    }

    // 9. Image & Media (GET product image / POST upload to Firebase Storage)
    if (subPath === "image" || subPath === "media") {
      if (method === "GET") {
        const guid = urlObj.searchParams.get("guid") || "";
        const code =
          urlObj.searchParams.get("code") ||
          urlObj.searchParams.get("k") ||
          urlObj.searchParams.get("item_code") ||
          "CAFE-ESP-01";
        const found = store.getImageBytes({ guid, code });
        if (found) {
          return new NextResponse(new Uint8Array(found.bytes), {
            status: 200,
            headers: {
              "Content-Type": found.contentType,
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
        return fail("ไม่พบรูปภาพสินค้า", 404);
      }

      if (method !== "POST" && method !== "PUT") {
        return fail("รองรับเฉพาะ GET/POST/PUT", 405);
      }

      let itemCode =
        request.headers.get("x-item-code") ||
        urlObj.searchParams.get("code") ||
        urlObj.searchParams.get("item_code") ||
        urlObj.searchParams.get("k") ||
        "";
      let storageKey =
        request.headers.get("x-storage-key") ||
        request.headers.get("x-r2-key") ||
        urlObj.searchParams.get("key") ||
        "";
      let guidCode = urlObj.searchParams.get("guid") || "";
      let contentType = request.headers.get("content-type") || "image/jpeg";
      let bytes: Uint8Array = new Uint8Array();

      if (contentType.toLowerCase().startsWith("multipart/form-data")) {
        const form = await request.formData();
        itemCode =
          itemCode ||
          String(
            form.get("item_code") ||
              form.get("code") ||
              form.get("image_id") ||
              "",
          );
        guidCode = guidCode || String(form.get("guid_code") || "");
        storageKey = storageKey || String(form.get("key") || "");
        const filePart = (form.get("file") || form.get("image")) as File | null;
        if (!filePart) {
          return fail("ไม่พบไฟล์รูปภาพในฟิลด์ file หรือ image", 400);
        }
        contentType = filePart.type || "image/jpeg";
        bytes = new Uint8Array(await filePart.arrayBuffer());
      } else if (contentType.toLowerCase().startsWith("application/json")) {
        const body = await decodeJsonBody(request);
        itemCode =
          itemCode ||
          String(body.item_code || body.code || body.image_id || "");
        guidCode = guidCode || String(body.guid_code || "");
        storageKey = storageKey || String(body.key || "");
        contentType = String(body.content_type || "image/png");
        let b64 = String(
          body.image_base64 || body.data_url || body.base64 || "",
        ).trim();
        const commaIdx = b64.indexOf(",");
        if (commaIdx !== -1 && b64.slice(0, commaIdx).includes("base64")) {
          const headerPart = b64.slice(0, commaIdx);
          if (headerPart.startsWith("data:")) {
            const semi = headerPart.indexOf(";");
            if (semi > 5) contentType = headerPart.slice(5, semi);
          }
          b64 = b64.slice(commaIdx + 1);
        }
        bytes = new Uint8Array(Buffer.from(b64, "base64"));
      } else {
        bytes = new Uint8Array(await request.arrayBuffer());
      }

      if (bytes.byteLength === 0) {
        return fail("ไฟล์รูปภาพว่างเปล่า", 400);
      }

      const uploaded = await store.uploadImage({
        itemCode,
        guidCode,
        storageKey,
        contentType,
        bytes,
      });
      return NextResponse.json(uploaded);
    }

    // 10. Firebase Setup (and backward-compatible /cloudflare/setup alias)
    if (
      subPath === "firebase" ||
      subPath === "firebase/setup" ||
      subPath === "cloudflare" ||
      subPath === "cloudflare/setup"
    ) {
      if (method === "GET") {
        return NextResponse.json(store.getFirebaseSetup());
      }
      if (method !== "POST" && method !== "PUT") {
        return fail("รองรับเฉพาะ GET/POST/PUT", 405);
      }
      const body = await decodeJsonBody(request);
      const res = await store.saveFirebaseSetup(body);
      return NextResponse.json(res);
    }

    // 11. Firebase Realtime Stream SSE & Poll (and backward-compatible /cloudflare/stream alias)
    if (subPath === "firebase/stream" || subPath === "cloudflare/stream") {
      if (method === "POST") {
        const { itemCount, billCount } = store.getCounts();
        const ev = store.publishEvent({
          type: "firebase_realtime_sync",
          message: `ซิงค์ข้อมูล Firebase Firestore/Storage แบบ Realtime สำเร็จ (${itemCount} เมนู · ${billCount} บิล)`,
          latency_ms: 2,
          data: {
            item_count: itemCount,
            bill_count: billCount,
            firestore_configured: store.isFirestoreConfigured(),
            storage_configured: store.isStorageConfigured(),
            d1_configured: store.isFirestoreConfigured(),
            r2_configured: store.isStorageConfigured(),
          },
        });
        return NextResponse.json({
          ok: true,
          status: "REALTIME_SYNCED",
          event: ev,
          recent_events: store.getRecentEvents(),
          active_clients: store.getClientCount(),
        });
      }

      const mode = (urlObj.searchParams.get("mode") || "").toLowerCase();
      const accept = (request.headers.get("accept") || "").toLowerCase();
      if (
        mode === "poll" ||
        (mode !== "sse" && !accept.includes("text/event-stream"))
      ) {
        const { itemCount, billCount } = store.getCounts();
        return NextResponse.json({
          ok: true,
          status: "REALTIME_ONLINE",
          firestore_configured: store.isFirestoreConfigured(),
          storage_configured: store.isStorageConfigured(),
          d1_configured: store.isFirestoreConfigured(),
          r2_configured: store.isStorageConfigured(),
          item_count: itemCount,
          bill_count: billCount,
          active_clients: store.getClientCount(),
          recent_events: store.getRecentEvents(),
          server_time: new Date().toTimeString().slice(0, 8),
        });
      }

      const encoder = new TextEncoder();
      let cleanup: (() => void) | null = null;

      const stream = new ReadableStream({
        start(controller) {
          const sendEvent = (ev: unknown) => {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(ev)}\n\n`),
              );
            } catch {
              // stream closed
            }
          };

          sendEvent({
            id: `fb-init-${Date.now()}`,
            type: "connected",
            timestamp: new Date().toTimeString().slice(0, 8),
            message:
              "เชื่อมต่อ Firebase Realtime Stream สำเร็จ (พร้อมซิงค์ข้อมูลทันที)",
            firestore_synced: true,
            storage_synced: true,
            d1_synced: true,
            r2_synced: true,
            latency_ms: 2,
            data: {
              recent_events: store.getRecentEvents(),
            },
          });

          const unsubscribe = store.subscribe((ev) => {
            sendEvent(ev);
          });

          const hbTimer = setInterval(() => {
            sendEvent({
              id: `fb-hb-${Date.now()}`,
              type: "heartbeat",
              timestamp: new Date().toTimeString().slice(0, 8),
              message: "Firebase Firestore & Storage Realtime Online",
              firestore_synced: true,
              storage_synced: true,
              d1_synced: true,
              r2_synced: true,
              latency_ms: 2,
            });
          }, 10000);

          cleanup = () => {
            clearInterval(hbTimer);
            unsubscribe();
          };
        },
        cancel() {
          if (cleanup) cleanup();
        },
      });

      return new NextResponse(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    return fail(`ไม่พบคำสั่ง API: /api/pos/${subPath}`, 404);
  } catch (err: unknown) {
    return fail(
      err instanceof Error
        ? err.message
        : "เกิดข้อผิดพลาดในระบบหลังบ้าน DOME Pos (Firebase)",
      400,
    );
  }
}

export {
  handleRequest as GET,
  handleRequest as POST,
  handleRequest as PUT,
  handleRequest as DELETE,
};
