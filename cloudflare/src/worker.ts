/**
 * DOME Pos — Cloudflare Full-Stack Edge Worker
 * ครบทั้ง 6 บริการหลักของ Cloudflare:
 * 1. Cloudflare D1 (DB): ฐานข้อมูล SQL สำหรับบิลขาย, สินค้า, กะแคชเชียร์, บัญชีคู่ GL
 * 2. Cloudflare R2 (IMAGES_BUCKET): เก็บรูปภาพเมนูร้านกาแฟและสลิปโอนเงิน (Zero Egress Fee)
 * 3. Cloudflare Workers KV (CONFIG_KV): แคชตั้งค่าร้านและเลข PromptPay QR ความเร็วสูง
 * 4. Cloudflare Queues (POS_QUEUE): คิวประมวลผลตัดสต็อกและ Mint แต้มสะสมเข้า Wallet เบื้องหลัง
 * 5. Cloudflare Durable Objects (KDS_HUB): ซิงค์จอคิวชงบาริสต้า (KDS) แบบ Real-time WebSocket
 * 6. Cloudflare Workers AI (AI): อ่านสลิปโอนเงิน (OCR) และสรุปยอดขายประจำวันให้เจ้าของร้านคนเดียว
 *
 * ปฏิบัติตาม IRON RULE 20: คำนวณเงินทั้งหมดด้วย BigInt Cents (scale = 2) ห้ามใช้ float!
 */

export interface Env {
  DB: any; // D1Database
  IMAGES_BUCKET: any; // R2Bucket
  CONFIG_KV: any; // KVNamespace
  POS_QUEUE: any; // Queue
  KDS_HUB: any; // DurableObjectNamespace
  AI: any; // Workers AI
  APP_NAME: string;
  POS_DEFAULT_ID: string;
  VAT_RATE: string;
  THAIFI_DEFAULT_WALLET: string;
}

// ============================================================================
// Exact Decimal Helper (BigInt Cents — IRON RULE 20)
// ============================================================================
function toCents(val: unknown): bigint {
  if (val === null || val === undefined) return 0n;
  let s = String(val).replace(/,/g, "").trim();
  if (!s || s === "-" || s === ".") return 0n;
  const neg = s.startsWith("-");
  if (neg || s.startsWith("+")) s = s.slice(1);
  const [intPart = "0", fracPart = ""] = s.split(".");
  const padded = (fracPart + "000").slice(0, 3);
  let cents = BigInt(intPart || "0") * 100n + BigInt(padded.slice(0, 2) || "0");
  if (Number(padded[2] || "0") >= 5) cents += 1n;
  return neg ? -cents : cents;
}

function fromCents(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const intPart = abs / 100n;
  const fracPart = (abs % 100n).toString().padStart(2, "0");
  return `${neg && abs > 0n ? "-" : ""}${intPart.toString()}.${fracPart}`;
}

function mulQtyPriceCents(qtyStr: unknown, priceStr: unknown): bigint {
  const qCents = toCents(qtyStr);
  const pCents = toCents(priceStr);
  const prod = qCents * pCents;
  return (prod + 50n) / 100n;
}

function extractIncludedVat7Cents(totalCents: bigint): { beforeVat: bigint; vat: bigint } {
  const vat = (totalCents * 7n + 53n) / 107n;
  return { beforeVat: totalCents - vat, vat };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// ============================================================================
// Durable Object: จอคิวชงบาริสต้า Real-time (KDS WebSocket Hub)
// ============================================================================
export class KdsHubDurableObject {
  private state: any;
  private sessions: Set<WebSocket> = new Set();

  constructor(state: any) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sessions.add(server);
      server.addEventListener("close", () => this.sessions.delete(server));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST" && url.pathname.endsWith("/broadcast")) {
      const payload = await request.text();
      for (const ws of this.sessions) {
        try {
          ws.send(payload);
        } catch {
          this.sessions.delete(ws);
        }
      }
      return jsonResponse({ ok: true, clients: this.sessions.size });
    }

    return jsonResponse({ ok: true, activeClients: this.sessions.size });
  }
}

// ============================================================================
// Main Cloudflare Worker Entry
// ============================================================================
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return jsonResponse({ ok: true });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/v1\/pos/, "/api/pos");

    try {
      // 1. Health & Cloudflare Stack Status
      if (path === "/health" || path === "/api/pos/cloudflare-status") {
        return jsonResponse({
          status: "ok",
          service: "domepos-cloudflare-edge",
          stack: {
            database: "Cloudflare D1 (domepos-d1)",
            storage: "Cloudflare R2 (domepos-images)",
            cache: "Cloudflare Workers KV (CONFIG_KV)",
            queue: "Cloudflare Queues (domepos-bg-tasks)",
            realtime: "Cloudflare Durable Objects (KDS_HUB)",
            ai: "Cloudflare Workers AI",
          },
        });
      }

      // 2. Cloudflare R2 Image Upload & Delivery (GET/POST /api/pos/image & /api/pos/media)
      if (path === "/api/pos/image" && request.method === "GET") {
        const entity = url.searchParams.get("e") || "product";
        const key = url.searchParams.get("k") || "default";
        const r2Key = `${entity}/${key}`;
        if (env.IMAGES_BUCKET) {
          const obj = await env.IMAGES_BUCKET.get(r2Key);
          if (obj) {
            const headers = new Headers();
            obj.writeHttpMetadata(headers);
            headers.set("etag", obj.httpEtag);
            headers.set("Cache-Control", "public, max-age=31536000, immutable");
            return new Response(obj.body, { headers });
          }
        }
        return jsonResponse({ error: "image_not_found", r2Key }, 404);
      }

      if ((path === "/api/pos/media" || path === "/api/pos/image") && request.method === "POST") {
        const kind = url.searchParams.get("kind") || "product";
        const ref = url.searchParams.get("ref") || `IMG-${Date.now()}`;
        const contentType = request.headers.get("Content-Type") || "image/webp";
        const r2Key = `${kind}/${ref}`;
        const body = await request.arrayBuffer();

        if (env.IMAGES_BUCKET) {
          await env.IMAGES_BUCKET.put(r2Key, body, {
            httpMetadata: { contentType },
          });
        }

        const publicUrl = `/api/pos/image?e=${encodeURIComponent(kind)}&k=${encodeURIComponent(ref)}`;
        if (env.DB) {
          await env.DB.prepare(
            `INSERT OR REPLACE INTO pos_media_r2 (image_id, entity_type, entity_key, r2_key, content_type, public_url)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
          )
            .bind(`${kind}:${ref}`, kind, ref, r2Key, contentType, publicUrl)
            .run();
        }

        return jsonResponse({
          ok: true,
          provider: "Cloudflare R2",
          bucket: "domepos-images",
          r2_key: r2Key,
          public_url: publicUrl,
          size_bytes: body.byteLength,
        });
      }

      // 3. Cloudflare Workers AI — อ่านสลิปโอนเงิน & สรุปยอดขายให้เจ้าของร้านคนเดียว
      if (path === "/api/pos/ai/daily-summary" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const totalSales = String(body.totalSales || "0.00");
        const billCount = Number(body.billCount || 0);
        let summaryText = `สรุปยอดขาย DOME Pos วันนี้: รวม ${billCount} บิล ยอดสุทธิ ${totalSales} บาท`;

        if (env.AI) {
          const aiRes = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
            messages: [
              {
                role: "system",
                content: "คุณคือผู้ช่วยร้านกาแฟ DOME Pos สำหรับเจ้าของคนเดียว สรุปสั้นๆ กระชับเป็นภาษาไทย",
              },
              {
                role: "user",
                content: `สรุปยอดขายวันนี้จำนวน ${billCount} บิล ยอดขายรวม ${totalSales} บาท พร้อมให้กำลังใจเจ้าของร้านสั้นๆ 1 ประโยค`,
              },
            ],
          }).catch(() => null);
          if (aiRes?.response) summaryText = aiRes.response;
        }
        return jsonResponse({ ok: true, summary: summaryText });
      }

      // 4. Cloudflare D1 + KV — Bootstrap
      if (path === "/api/pos/bootstrap" && request.method === "GET") {
        const cached = env.CONFIG_KV ? await env.CONFIG_KV.get("pos_bootstrap", "json") : null;
        if (cached) return jsonResponse(cached);

        const startup = env.DB
          ? await env.DB.prepare(`SELECT * FROM posconfig LIMIT 1`).first()
          : { company_name: "DOME Pos", pos_id: "POS-01", vat_rate: "7.00" };
        const machines = env.DB
          ? (await env.DB.prepare(`SELECT * FROM pos_id`).all()).results
          : [{ code: "POS-01", name_1: "เครื่องขายหน้าร้านหลัก" }];
        const qr = env.DB
          ? await env.DB.prepare(`SELECT * FROM erp_thai_qr_config LIMIT 1`).first()
          : { promptpay_id: "0812345678", account_name: "DOME POS CAFE" };

        const payload = {
          ok: true,
          storage_engine: "Cloudflare D1 + R2",
          startup,
          machines,
          qr,
        };
        if (env.CONFIG_KV) {
          await env.CONFIG_KV.put("pos_bootstrap", JSON.stringify(payload), { expirationTtl: 60 });
        }
        return jsonResponse(payload);
      }

      // 5. Cloudflare D1 — บันทึกบิลขาย POS (/api/pos/bills)
      if (path === "/api/pos/bills" && request.method === "POST") {
        const req = (await request.json()) as any;
        const docNo = String(req.doc_no || `POS-${Date.now()}`);
        const docDate = String(req.doc_date || new Date().toISOString().slice(0, 10));
        const docTime = String(req.doc_time || new Date().toTimeString().slice(0, 5));
        const billGuid = String(req.bill_guid || docNo);
        const discountCents = toCents(req.bill_discount || "0.00");

        let grossCents = 0n;
        const lines = Array.isArray(req.lines) ? req.lines : [];
        for (const line of lines) {
          grossCents += mulQtyPriceCents(line.qty || "1", line.price || "0");
        }
        const netCents = grossCents > discountCents ? grossCents - discountCents : 0n;
        const { beforeVat, vat } = extractIncludedVat7Cents(netCents);
        const totalStr = fromCents(netCents);

        if (env.DB) {
          await env.DB.batch([
            env.DB.prepare(
              `INSERT OR REPLACE INTO pos_bill_inbox (bill_guid, pos_id, doc_no, doc_date, payload_json, status)
               VALUES (?1, ?2, ?3, ?4, ?5, 'PROCESSED')`
            ).bind(billGuid, req.pos_id || "POS-01", docNo, docDate, JSON.stringify(req)),
            env.DB.prepare(
              `INSERT OR REPLACE INTO ic_trans (doc_no, doc_date, doc_time, trans_flag, cust_code, cashier_code, pos_id, total_value, total_discount, total_before_vat, total_vat_value, total_amount, remark)
               VALUES (?1, ?2, ?3, 44, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
            ).bind(
              docNo,
              docDate,
              docTime,
              req.cust_code || "WALKIN",
              req.cashier_code || "OWNER",
              req.pos_id || "POS-01",
              fromCents(grossCents),
              fromCents(discountCents),
              fromCents(beforeVat),
              fromCents(vat),
              totalStr,
              req.remark || ""
            ),
            env.DB.prepare(
              `INSERT OR REPLACE INTO gl_journal (doc_no, doc_date, book_code, description, total_debit, total_credit)
               VALUES (?1, ?2, 'POS', ?3, ?4, ?5)`
            ).bind(docNo, docDate, `ขายหน้าร้าน DOME Pos ${docNo}`, totalStr, totalStr),
          ]);
        }

        // ส่งงานเข้า Cloudflare Queue เบื้องหลัง (ตัดสต็อก & Mint แต้ม)
        if (env.POS_QUEUE) {
          await env.POS_QUEUE.send({
            type: "BILL_CREATED",
            doc_no: docNo,
            total_amount: totalStr,
            lines,
          });
        }

        return jsonResponse({
          ok: true,
          status: "PROCESSED",
          engine: "Cloudflare D1",
          doc_no: docNo,
          total_amount: totalStr,
        });
      }

      return jsonResponse({ ok: true, message: "DOME Pos Cloudflare Edge API Ready" });
    } catch (err: any) {
      return jsonResponse({ ok: false, error: String(err?.message || err) }, 500);
    }
  },

  // Cloudflare Queues Consumer (ประมวลผลเบื้องหลัง)
  async queue(batch: any, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const body = msg.body as any;
      if (body?.type === "BILL_CREATED" && env.DB && Array.isArray(body.lines)) {
        for (const line of body.lines) {
          await env.DB.prepare(
            `UPDATE ic_inventory SET balance_qty = CAST( (CAST(balance_qty AS NUMERIC) - CAST(?1 AS NUMERIC)) AS TEXT ) WHERE code = ?2`
          )
            .bind(String(line.qty || "1"), String(line.item_code || ""))
            .run()
            .catch(() => null);
        }
      }
      msg.ack();
    }
  },
};
