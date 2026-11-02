"use client";

import { formatMoneyDisplay as formatMoney } from "@/lib/numeric";
import type { StarterCategory, StarterMenuItem } from "../DomePosScreen";

export interface ItemTileProps {
  item: StarterMenuItem;
  qtyInCart: string;
  hasInCart: boolean;
  isAnimating: boolean;
  onSelect: (item: StarterMenuItem) => void;
}

const CATEGORY_STRIPE_COLOR: Record<Exclude<StarterCategory, "ALL">, string> = {
  COFFEE: "bg-[#6d4c41]",
  NON_COFFEE: "bg-[#2fa84f]",
  STUDIO: "bg-[#5e35b1]",
  ERP: "bg-[#0288d1]",
};

export function ItemTile({
  item,
  qtyInCart,
  hasInCart,
  isAnimating,
  onSelect,
}: ItemTileProps) {
  const imgSrc = item.imageUrl || `/products/${item.code}.jpg`;
  const stripeClass = CATEGORY_STRIPE_COLOR[item.category] || "bg-[#2fa84f]";
  const isHot = item.code.endsWith("-H");
  const isCold = item.code.endsWith("-C");

  return (
    <button
      type="button"
      data-testid={`pos-starter-item-${item.code}`}
      onClick={() => onSelect(item)}
      className={`group relative flex flex-col overflow-hidden rounded-[6px] border bg-white text-left transition select-none focus:outline-none ${
        isAnimating
          ? "border-[#2fa84f] ring-2 ring-[#2fa84f]"
          : hasInCart
            ? "border-[#2fa84f] ring-1 ring-[#2fa84f]"
            : "border-[#e0e0e0] hover:border-[#bdbdbd]"
      }`}
    >
      {/* Top category color bar (Loyverse tile accent) */}
      <div className={`h-1 w-full shrink-0 ${stripeClass}`} />

      {/* Floating +1 feedback */}
      {isAnimating && (
        <div className="dp-plus-one pointer-events-none absolute top-2 right-2 z-20 rounded bg-[#2fa84f] px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
          +1
        </div>
      )}

      {/* Cart quantity badge */}
      {hasInCart && !isAnimating && (
        <div
          key={qtyInCart}
          className="pointer-events-none absolute top-2 right-2 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2fa84f] px-1.5 font-mono text-[11px] font-bold text-white shadow-xs"
        >
          {qtyInCart}
        </div>
      )}

      {/* Hot / Iced compact corner indicator */}
      {(isHot || isCold) && (
        <span
          className={`pointer-events-none absolute top-2 left-2 z-10 rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${
            isHot ? "bg-[#e53935]/90" : "bg-[#0288d1]/90"
          }`}
        >
          {isHot ? "ร้อน" : "เย็น"}
        </span>
      )}

      {/* Compact thumbnail */}
      <div className="relative h-24 w-full shrink-0 overflow-hidden bg-[#f5f5f5]">
        <img
          src={imgSrc}
          alt={item.name}
          data-testid={`pos-starter-img-${item.code}`}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              "/products/CAFE-ESP-01.jpg";
          }}
          className="h-full w-full object-cover"
        />
      </div>

      {/* Item title & price footer */}
      <div className="flex flex-1 flex-col justify-between px-2.5 py-2">
        <div className="line-clamp-1 text-xs font-bold text-[#212121]">
          {item.name}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-[10px] text-[#757575]">
            {item.code}
          </span>
          <span className="font-mono text-xs font-bold text-[#23863e]">
            ฿{formatMoney(item.price, 2)}
          </span>
        </div>
      </div>
    </button>
  );
}

