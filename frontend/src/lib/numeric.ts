/**
 * ฟังก์ชันช่วยเหลือสำหรับการควบคุมช่องกรอกตัวเลข (NumberBox) และการคำนวณเงินแบบ Decimal แม่นยำ 100%
 * ตามมาตรฐาน BigInt Fixed-Point Decimal Engine และ IRON RULE 20
 * ห้ามใช้ float / parseFloat / Number() ในการคำนวณเงินหรือภาษีเด็ดขาด
 */

export function cleanNumericString(
  val: string,
  allowNegative = true,
  allowDecimal = true,
): string {
  if (!val) return "";
  let s = String(val).trim();

  const isNegative = allowNegative && s.startsWith("-");
  s = s.replace(/[^0-9.]/g, "");

  if (allowDecimal) {
    const firstDotIndex = s.indexOf(".");
    if (firstDotIndex !== -1) {
      const beforeDot = s.slice(0, firstDotIndex);
      const afterDot = s.slice(firstDotIndex + 1).replace(/\./g, "");
      s = `${beforeDot}.${afterDot}`;
    }
  } else {
    const dotIndex = s.indexOf(".");
    if (dotIndex !== -1) s = s.slice(0, dotIndex);
  }

  if (!s || s === ".") {
    return isNegative ? "-" : s;
  }

  return isNegative ? `-${s}` : s;
}

export function todayLocal(d: Date = new Date()): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

// ============================================================================
// BigInt Fixed-Point Decimal Engine (INTERNAL_SCALE = 12)
// ============================================================================

const INTERNAL_SCALE = 12;
const BI_0 = BigInt(0);
const BI_1 = BigInt(1);
const BI_2 = BigInt(2);
const BI_5 = BigInt(5);
const BI_10 = BigInt(10);
const BI_100 = BigInt(100);
const SCALE_FACTOR = BigInt("1000000000000");

function pow10BigInt(exp: number): bigint {
  if (exp <= 0) return BI_1;
  return BigInt("1" + "0".repeat(exp));
}

export function parseScaled(val: unknown): bigint {
  if (val === null || val === undefined) return BI_0;
  if (typeof val === "bigint") return val * SCALE_FACTOR;
  let s = String(val).replace(/,/g, "").trim();
  if (!s || s === "-" || s === ".") return BI_0;
  if (s.startsWith("+")) s = s.slice(1);
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  if (s.startsWith(".")) s = `0${s}`;
  if (s.endsWith(".")) s = s.slice(0, -1);
  if (!/^\d+(\.\d+)?$/.test(s)) return BI_0;

  const [intPart, fracPart = ""] = s.split(".");
  const paddedFrac = (fracPart + "0".repeat(INTERNAL_SCALE)).slice(
    0,
    INTERNAL_SCALE,
  );
  let res = BigInt(intPart || "0") * SCALE_FACTOR + BigInt(paddedFrac || "0");
  if (fracPart.length > INTERNAL_SCALE) {
    const nextDigit = Number(fracPart[INTERNAL_SCALE]);
    if (nextDigit >= 5) res += BI_1;
  }
  return neg ? -res : res;
}

export function formatScaled(
  scaled: bigint,
  decimals = 2,
  trimTrailingZeros = false,
): string {
  const rounded = roundScaledHalfUp(scaled, decimals);
  const neg = rounded < BI_0;
  const abs = neg ? -rounded : rounded;
  const intPart = abs / SCALE_FACTOR;
  const rem = abs % SCALE_FACTOR;

  if (decimals <= 0) {
    return `${neg && intPart > BI_0 ? "-" : ""}${intPart.toString()}`;
  }

  const fracFull = rem.toString().padStart(INTERNAL_SCALE, "0");
  let frac = fracFull.slice(0, decimals);
  if (trimTrailingZeros) {
    frac = frac.replace(/0+$/, "");
  }
  const sign =
    neg && (intPart > BI_0 || frac.replace(/0/g, "") !== "") ? "-" : "";
  return frac.length > 0
    ? `${sign}${intPart.toString()}.${frac}`
    : `${sign}${intPart.toString()}`;
}

function roundScaledHalfUp(scaled: bigint, decimals: number): bigint {
  const targetDecimals = Math.max(0, Math.min(INTERNAL_SCALE, decimals));
  const dropDigits = INTERNAL_SCALE - targetDecimals;
  if (dropDigits <= 0) return scaled;
  const divisor = pow10BigInt(dropDigits);
  const half = divisor / BI_2;
  const neg = scaled < BI_0;
  const abs = neg ? -scaled : scaled;
  const q = (abs + half) / divisor;
  const res = q * divisor;
  return neg ? -res : res;
}

export function roundSml(
  val: unknown,
  digits = 2,
  cascade = true,
): string {
  const targetDigits = Math.max(0, Math.min(8, digits));
  if (!cascade) {
    return formatScaled(parseScaled(val), targetDigits);
  }

  let s = String(val ?? "0").replace(/,/g, "").trim();
  if (!s || s === "-" || s === ".") return formatScaled(BI_0, targetDigits);
  const neg = s.startsWith("-");
  if (neg || s.startsWith("+")) s = s.slice(1);
  if (s.startsWith(".")) s = `0${s}`;
  if (!/^\d+(\.\d+)?$/.test(s)) return formatScaled(BI_0, targetDigits);

  const [intStr, rawFrac = ""] = s.split(".");
  const cleanFrac = rawFrac.replace(/0+$/, "");
  if (cleanFrac.length <= targetDigits) {
    const padded = cleanFrac.padEnd(targetDigits, "0");
    const out = targetDigits > 0 ? `${intStr}.${padded}` : intStr;
    const isZero = BigInt(intStr || "0") === BI_0 && /^0*$/.test(padded);
    return neg && !isZero ? `-${out}` : out;
  }

  let currentLen = cleanFrac.length;
  let currentInt = BigInt(intStr + cleanFrac);
  while (currentLen > targetDigits) {
    const rem = currentInt % BI_10;
    currentInt = currentInt / BI_10;
    if (rem >= BI_5) {
      currentInt += BI_1;
    }
    currentLen--;
  }

  const divisor = pow10BigInt(targetDigits);
  const finalInt = currentInt / divisor;
  const finalFrac = currentInt % divisor;
  const isZero = finalInt === BI_0 && finalFrac === BI_0;
  const sign = neg && !isZero ? "-" : "";
  if (targetDigits === 0) {
    return `${sign}${finalInt.toString()}`;
  }
  return `${sign}${finalInt.toString()}.${finalFrac.toString().padStart(targetDigits, "0")}`;
}

export function addDec(a: unknown, b: unknown, decimals?: number): string {
  const sum = parseScaled(a) + parseScaled(b);
  if (decimals === undefined) return formatScaled(sum, 6, true);
  return formatScaled(sum, decimals);
}

export function subDec(a: unknown, b: unknown, decimals?: number): string {
  const diff = parseScaled(a) - parseScaled(b);
  if (decimals === undefined) return formatScaled(diff, 6, true);
  return formatScaled(diff, decimals);
}

export function mulDec(a: unknown, b: unknown, decimals?: number): string {
  const pa = parseScaled(a);
  const pb = parseScaled(b);
  const prod = pa * pb;
  const neg = prod < BI_0;
  const abs = neg ? -prod : prod;
  const scaled = (abs + SCALE_FACTOR / BI_2) / SCALE_FACTOR;
  const signed = neg ? -scaled : scaled;
  if (decimals === undefined) return formatScaled(signed, 6, true);
  return formatScaled(signed, decimals);
}

export function divDec(a: unknown, b: unknown, decimals?: number): string {
  const pa = parseScaled(a);
  const pb = parseScaled(b);
  if (pb === BI_0) return formatScaled(BI_0, decimals ?? 2);
  const neg = (pa < BI_0) !== (pb < BI_0);
  const absA = pa < BI_0 ? -pa : pa;
  const absB = pb < BI_0 ? -pb : pb;
  const scaled = (absA * SCALE_FACTOR + absB / BI_2) / absB;
  const signed = neg ? -scaled : scaled;
  if (decimals === undefined) return formatScaled(signed, 6, true);
  return formatScaled(signed, decimals);
}

export function cmpDec(a: unknown, b: unknown): -1 | 0 | 1 {
  const pa = parseScaled(a);
  const pb = parseScaled(b);
  if (pa < pb) return -1;
  if (pa > pb) return 1;
  return 0;
}

export function sumDec(items: unknown[], decimals = 2): string {
  let total = BI_0;
  for (const item of items) {
    total += parseScaled(item);
  }
  return formatScaled(total, decimals);
}

export function isZeroDecimal(val: unknown, decimals = 6): boolean {
  if (val === null || val === undefined) return true;
  const s = String(val).replace(/,/g, "").trim();
  if (!s || s === "-" || s === ".") return true;
  return roundScaledHalfUp(parseScaled(s), Math.max(0, decimals)) === BI_0;
}

/**
 * แสดงผลตัวเลขพร้อม comma คั่นหลักพัน และทศนิยม 2 ตำแหน่ง
 * กฎเหล็ก: ถ้าตัวเลขมีค่าเป็น 0 หรือ 0.00 ไม่ต้องแสดง 0.00 ให้แสดงว่าง ("") เลย
 */
export function formatMoneyDisplay(
  val: unknown,
  decimals = 2,
): string {
  const targetDecimals = decimals ?? 2;
  if (val === null || val === undefined) return "";
  const raw = String(val).replace(/,/g, "").trim();
  if (!raw || raw === "-" || raw === ".") return "";
  const rounded = roundScaledHalfUp(parseScaled(raw), targetDecimals);
  if (rounded === BI_0) {
    return "";
  }
  const fixed = formatScaled(rounded, targetDecimals);
  const neg = fixed.startsWith("-");
  const clean = neg ? fixed.slice(1) : fixed;
  const [intPart, fracPart] = clean.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const out = fracPart !== undefined ? `${withCommas}.${fracPart}` : withCommas;
  return neg ? `-${out}` : out;
}
