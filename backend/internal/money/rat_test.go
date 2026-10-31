package money

import (
	"math/big"
	"testing"
)

func TestRatExactAddition_ZeroPointOnePlusZeroPointTwo(t *testing.T) {
	a := ParseRat("0.1")
	b := ParseRat("0.2")
	sum := new(big.Rat).Add(a, b)
	expected := ParseRat("0.3")

	if sum.Cmp(expected) != 0 {
		t.Fatalf("expected 0.1 + 0.2 == 0.3 exactly, got %s", sum.RatString())
	}
	if FormatRat(sum, 2) != "0.30" {
		t.Fatalf("expected FormatRat(0.1+0.2, 2) == 0.30, got %s", FormatRat(sum, 2))
	}
}

func TestVAT7InclusiveAndGLBalance(t *testing.T) {
	// อเมริกาโน่เย็น 2 แก้ว @ 75.00 = 150.00 + คราฟต์เบียร์ Hazy IPA 1 แก้ว @ 220.00 = 220.00 -> รวม 370.00 บาท
	lines := []LineCalcInput{
		{Qty: ParseRat("2"), Price: ParseRat("75.00"), Discount: ParseRat("0.00")},
		{Qty: ParseRat("1"), Price: ParseRat("220.00"), Discount: ParseRat("0.00")},
	}
	totals := CalcBillTotals(lines, ParseRat("0.00"), 1, ParseRat("7.00"))
	if totals.TotalAmount != "370.00" {
		t.Fatalf("expected TotalAmount 370.00, got %s", totals.TotalAmount)
	}
	// 370 * 7 / 107 = 24.2056... -> 24.21
	if totals.TotalVatValue != "24.21" {
		t.Fatalf("expected TotalVatValue 24.21, got %s", totals.TotalVatValue)
	}
	// 370.00 - 24.21 = 345.79
	if totals.TotalBeforeVat != "345.79" {
		t.Fatalf("expected TotalBeforeVat 345.79, got %s", totals.TotalBeforeVat)
	}

	pay, err := CalcPaymentBreakdown(ParseRat(totals.TotalAmount), []PaymentInput{
		{Method: "CASH", Amount: ParseRat("170.00")},
		{Method: "PROMPTPAY", Amount: ParseRat("200.00")},
	})
	if err != nil {
		t.Fatalf("unexpected payment error: %v", err)
	}
	if pay.NetCash != "170.00" || pay.NetWallet != "200.00" || pay.MoneyChange != "0.00" {
		t.Fatalf("unexpected payment breakdown: %+v", pay)
	}

	glLines, balancedTotal, err := BuildPosSaleGLLines(totals, pay)
	if err != nil {
		t.Fatalf("BuildPosSaleGLLines failed: %v", err)
	}
	if balancedTotal != "370.00" {
		t.Fatalf("expected balanced GL total 370.00, got %s", balancedTotal)
	}
	if len(glLines) != 4 {
		t.Fatalf("expected 4 GL lines (Cash, Bank, Sales, VAT), got %d", len(glLines))
	}

	revLines, revTotal, err := ReverseGLLines(glLines)
	if err != nil {
		t.Fatalf("ReverseGLLines failed: %v", err)
	}
	if revTotal != "370.00" || len(revLines) != 4 {
		t.Fatalf("unexpected reversed GL lines: total=%s len=%d", revTotal, len(revLines))
	}
}

func TestRoundingBoundariesAndPoints(t *testing.T) {
	if FormatRat(ParseRat("10.005"), 2) != "10.01" {
		t.Fatalf("expected 10.005 -> 10.01, got %s", FormatRat(ParseRat("10.005"), 2))
	}
	if FormatRat(ParseRat("10.004"), 2) != "10.00" {
		t.Fatalf("expected 10.004 -> 10.00, got %s", FormatRat(ParseRat("10.004"), 2))
	}
	if pts := CalcPointsEarned("370.00", "100.00"); pts != 3 {
		t.Fatalf("expected 3 points for 370.00 at 100 baht/point, got %d", pts)
	}
	if pts := CalcPointsEarned("85.00", "100.00"); pts != 0 {
		t.Fatalf("expected 0 points for 85.00 at 100 baht/point, got %d", pts)
	}
}
