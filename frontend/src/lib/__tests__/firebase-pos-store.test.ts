import test from "node:test";
import assert from "node:assert/strict";
import {
  calcBillTotals,
  calcPaymentBreakdown,
  buildPosSaleGLLines,
  calcPointsEarned,
  FirebasePosStore,
} from "../firebase-pos-store.ts";

test("calcBillTotals & buildPosSaleGLLines compute exact fixed-point VAT 7% and balanced GL (Dr == Cr)", () => {
  const totals = calcBillTotals(
    [
      { qty: "2", price: "75.00", discount: "0.00" },
      { qty: "1", price: "220.00", discount: "0.00" },
    ],
    "0.00",
    1,
    "7.00",
  );

  assert.equal(totals.totalValue, "370.00");
  assert.equal(totals.totalAmount, "370.00");
  assert.equal(totals.totalVatValue, "24.21");
  assert.equal(totals.totalBeforeVat, "345.79");

  const pay = calcPaymentBreakdown("370.00", [
    { method: "CASH", amount: "170.00" },
    { method: "PROMPTPAY", amount: "200.00" },
  ]);

  assert.equal(pay.netCash, "170.00");
  assert.equal(pay.netWallet, "200.00");
  assert.equal(pay.netBankTotal, "200.00");
  assert.equal(pay.moneyChange, "0.00");
  assert.equal(pay.primaryMethod, "MIXED");

  const gl = buildPosSaleGLLines(totals, pay);
  assert.equal(gl.total, "370.00");
  assert.equal(gl.lines.length, 4);
  assert.equal(calcPointsEarned("370.00", "100.00"), 3);
});

test("FirebasePosStore seeds 17 Entrance Creative Space items (16 drinks + 1 In-Ear Studio), processes bills idempotently, and cancels bills with GL reversal", async () => {
  const store = new FirebasePosStore({ inMemoryOnly: true });

  const boot = await store.getBootstrap();
  assert.equal(boot.ok, true);
  assert.equal((boot.products as unknown[]).length, 17);
  assert.equal(
    (boot.firebase as Record<string, unknown>).database_provider,
    "firebase-firestore",
  );

  const billRes = await store.processBill({
    bill_guid: "GUID-TEST-001",
    doc_no: "ECS-261102-0001",
    doc_date: "2026-11-02",
    doc_time: "09:15",
    cashier_code: "OWNER-01",
    cust_code: "WALKIN",
    bill_discount: "0.00",
    remark: "ห้องซ้อมดนตรี S1 (ชั้น 2 · In-Ear Monitor)",
    lines: [
      {
        item_code: "CF-AME-C",
        barcode: "8859100001022",
        name: "Americano เย็น",
        unit_code: "แก้ว",
        qty: "2",
        price: "50.00",
        discount: "0.00",
      },
      {
        item_code: "ST-ROOM-01",
        barcode: "8859100003011",
        name: "ห้องซ้อมดนตรี In-Ear Monitor (ชั้น 2)",
        unit_code: "ชั่วโมง",
        qty: "1",
        price: "250.00",
        discount: "0.00",
      },
    ],
    payments: [
      { method: "CASH", amount: "100.00" },
      { method: "PROMPTPAY", amount: "250.00" },
    ],
  });

  assert.equal(billRes.ok, true);
  assert.equal(billRes.doc_no, "ECS-261102-0001");
  assert.equal(billRes.total_amount, "350.00");
  assert.equal(billRes.points_earned, 3);
  assert.equal(billRes.duplicate, false);

  // Idempotent duplicate check
  const dupRes = await store.processBill({
    bill_guid: "GUID-TEST-001",
    doc_no: "ECS-261102-0001",
    lines: [{ item_code: "CF-AME-C", qty: "2", price: "50.00" }],
  });
  assert.equal(dupRes.duplicate, true);
  assert.equal(dupRes.total_amount, "350.00");

  // Restore includes the bill
  const restore = await store.getRestore("POS-01");
  assert.equal((restore.bills as unknown[]).length, 1);

  // Cancel bill
  const cancelRes = await store.shiftAction({
    action: "cancel_bill",
    doc_no: "ECS-261102-0001",
    reason: "ลูกค้าเลื่อนเวลาซ้อมดนตรี",
  });
  assert.equal(cancelRes.ok, true);
  assert.equal(cancelRes.status, "CANCELLED");
  assert.equal((cancelRes.data as Record<string, unknown>).status, "cancelled");
});

test("FirebasePosStore upserts/deletes menu items and saves Firebase setup", async () => {
  const store = new FirebasePosStore({ inMemoryOnly: true });

  const upsertRes = await store.shiftAction({
    action: "upsert_item",
    item_code: "ECS-NEW-99",
    name: "เอสเปรสโซ่ส้มยูซุ",
    category: "COFFEE",
    unit_code: "แก้ว",
    retail_price: "60.00",
  });
  assert.equal(upsertRes.ok, true);
  assert.equal(upsertRes.status, "UPSERTED");

  const syncAfterUpsert = await store.getSync("");
  assert.equal((syncAfterUpsert.products as unknown[]).length, 18);

  const delRes = await store.shiftAction({
    action: "delete_item",
    item_code: "ECS-NEW-99",
  });
  assert.equal(delRes.ok, true);
  assert.equal(delRes.status, "DELETED");

  const syncAfterDel = await store.getSync("");
  assert.equal((syncAfterDel.products as unknown[]).length, 17);

  const fbSetup = await store.saveFirebaseSetup({
    project_id: "domepos-demo",
    api_key: "AIzaSyDemoKey123456",
    database_id: "(default)",
    storage_bucket: "domepos-demo.firebasestorage.app",
  });
  assert.equal(fbSetup.ok, true);
  assert.equal(fbSetup.status, "FIREBASE_CONNECTED");
  assert.equal(fbSetup.firestore_configured, true);
  assert.equal(fbSetup.storage_configured, true);

  // Realtime event subscription + config update + shift open/close + image upload
  const receivedEvents: string[] = [];
  const unsubscribe = store.subscribe((ev) => {
    receivedEvents.push(ev.type);
  });

  const cfgSection = await store.saveConfig({
    section: "startup",
    shop_name: "Dome Cafe & Craft Bar (Firebase)",
    vat_rate: "7.00",
    vat_type: 1,
  });
  assert.equal(cfgSection, "startup");

  const imgRes = await store.uploadImage({
    itemCode: "CAFE-ESP-01",
    contentType: "image/png",
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  });
  assert.equal(imgRes.ok, true);
  assert.equal(imgRes.status, "UPLOADED");

  const closeShiftRes = await store.shiftAction({
    action: "close_shift",
    pos_id: "POS-01",
    cashier_code: "OWNER-01",
    closing_cash: "2500.00",
  });
  assert.equal(closeShiftRes.ok, true);
  assert.equal(closeShiftRes.status, "CLOSED");

  const openShiftRes = await store.shiftAction({
    action: "open_shift",
    pos_id: "POS-01",
    cashier_code: "OWNER-01",
    opening_cash: "1500.00",
  });
  assert.equal(openShiftRes.ok, true);
  assert.equal(openShiftRes.status, "OPENED");

  unsubscribe();
  assert.ok(receivedEvents.includes("storage_uploaded"));
  assert.ok(receivedEvents.includes("shift_updated"));
});
