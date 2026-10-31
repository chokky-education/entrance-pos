package money

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"
)

var (
	ErrInvalidDecimal    = errors.New("money: invalid decimal format")
	ErrUnbalancedJournal = errors.New("money: GL journal debit and credit totals do not balance")
	decimalPattern       = regexp.MustCompile(`^-?\d+(\.\d+)?$`)
)

// Dec is a JSON decimal value sent as a string or number, parsed strictly via string into *big.Rat (never float64).
type Dec string

func (d *Dec) UnmarshalJSON(b []byte) error {
	s := strings.TrimSpace(string(b))
	if s == "" || s == "null" {
		*d = "0.00"
		return nil
	}
	if strings.HasPrefix(s, `"`) {
		var unquoted string
		if err := json.Unmarshal(b, &unquoted); err != nil {
			return err
		}
		s = strings.TrimSpace(unquoted)
	}
	s = strings.ReplaceAll(s, ",", "")
	if s == "" {
		*d = "0.00"
		return nil
	}
	if !decimalPattern.MatchString(s) {
		return fmt.Errorf("%w: %q", ErrInvalidDecimal, s)
	}
	*d = Dec(s)
	return nil
}

func (d Dec) Rat() *big.Rat {
	return ParseRat(string(d))
}

func (d Dec) String() string {
	if strings.TrimSpace(string(d)) == "" {
		return "0.00"
	}
	return FormatRat(d.Rat(), 2)
}

var pow10Table = func() []*big.Int {
	tbl := make([]*big.Int, 19)
	for i := range tbl {
		tbl[i] = new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(i)), nil)
	}
	return tbl
}()

func pow10Int(n int) *big.Int {
	if n >= 0 && n < len(pow10Table) {
		return pow10Table[n]
	}
	return new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(n)), nil)
}

// ParseRat parses a decimal string into *big.Rat without ever touching float64.
func ParseRat(s string) *big.Rat {
	cleaned := strings.ReplaceAll(strings.TrimSpace(s), ",", "")
	if cleaned == "" {
		return new(big.Rat)
	}
	r, ok := new(big.Rat).SetString(cleaned)
	if !ok {
		return new(big.Rat)
	}
	return r
}

// ParseValidRat validates and parses a decimal string or json.Number.
func ParseValidRat(v any, fallback string) (*big.Rat, error) {
	if v == nil {
		return ParseRat(fallback), nil
	}
	var s string
	switch val := v.(type) {
	case string:
		s = strings.TrimSpace(val)
	case json.Number:
		s = strings.TrimSpace(val.String())
	case Dec:
		s = strings.TrimSpace(string(val))
	case int:
		s = fmt.Sprintf("%d", val)
	case int64:
		s = fmt.Sprintf("%d", val)
	default:
		s = strings.TrimSpace(fmt.Sprintf("%v", val))
	}
	s = strings.ReplaceAll(s, ",", "")
	if s == "" || s == "<nil>" {
		return ParseRat(fallback), nil
	}
	if !decimalPattern.MatchString(s) {
		return nil, fmt.Errorf("%w: %q", ErrInvalidDecimal, s)
	}
	return ParseRat(s), nil
}

// RoundHalfUp rounds r to scale decimal places using commercial HALF_UP rounding.
func RoundHalfUp(r *big.Rat, scale int) *big.Rat {
	if r == nil || r.Sign() == 0 {
		return new(big.Rat)
	}
	if scale < 0 {
		scale = 0
	}
	tenPow := pow10Int(scale)
	den := r.Denom()
	if den.Cmp(pow10Table[0]) == 0 {
		return new(big.Rat).Set(r)
	}
	num := new(big.Int).Mul(r.Num(), tenPow)
	neg := num.Sign() < 0
	if neg {
		num.Neg(num)
	}
	quo, rem := new(big.Int).QuoRem(num, den, new(big.Int))
	if new(big.Int).Lsh(rem, 1).Cmp(den) >= 0 {
		quo.Add(quo, pow10Table[0])
	}
	if neg {
		quo.Neg(quo)
	}
	return new(big.Rat).SetFrac(quo, tenPow)
}

// FormatRat formats r as a fixed-point string with scale decimal places.
func FormatRat(r *big.Rat, scale int) string {
	return RoundHalfUp(r, scale).FloatString(scale)
}

// EqualAtScale checks if a and b are equal when rounded to scale decimal places.
func EqualAtScale(a, b *big.Rat, scale int) bool {
	return RoundHalfUp(a, scale).Cmp(RoundHalfUp(b, scale)) == 0
}

type LineCalcInput struct {
	Qty      *big.Rat
	Price    *big.Rat
	Discount *big.Rat
}

type LineCalcOutput struct {
	Qty               string
	Price             string
	PriceExcludeVat   string
	DiscountAmount    string
	SumAmount         string
	SumAmountExclVat  string
	VatValue          string
	SumRat            *big.Rat
}

type BillCalcTotals struct {
	TotalValue     string
	TotalDiscount  string
	TotalBeforeVat string
	TotalVatValue  string
	TotalAfterVat  string
	TotalExceptVat string
	TotalAmount    string
	Lines          []LineCalcOutput
}

// CalcBillTotals computes line and bill header totals with VAT (default 7%) using exact *big.Rat arithmetic.
// vatType: 1 = VAT included (ภาษีรวมใน), 0 or 2 = VAT excluded (ภาษีแยกนอก), 3 = No VAT (ยกเว้นภาษี).
func CalcBillTotals(lines []LineCalcInput, billDiscount *big.Rat, vatType int, vatRate *big.Rat) BillCalcTotals {
	hundred := big.NewRat(100, 1)
	if vatRate == nil || vatRate.Sign() < 0 {
		vatRate = big.NewRat(7, 1)
	}
	hundredPlusRate := new(big.Rat).Add(hundred, vatRate)

	totalValRat := new(big.Rat)
	outLines := make([]LineCalcOutput, len(lines))

	for i, l := range lines {
		qty := l.Qty
		if qty == nil {
			qty = new(big.Rat)
		}
		price := l.Price
		if price == nil {
			price = new(big.Rat)
		}
		disc := l.Discount
		if disc == nil || disc.Sign() < 0 {
			disc = new(big.Rat)
		}
		gross := new(big.Rat).Mul(qty, price)
		lineSum := new(big.Rat).Sub(gross, disc)
		if lineSum.Sign() < 0 {
			lineSum = new(big.Rat)
		}
		lineSum = RoundHalfUp(lineSum, 2)
		totalValRat.Add(totalValRat, lineSum)

		priceEx := new(big.Rat).Set(price)
		sumEx := new(big.Rat).Set(lineSum)
		lineVat := new(big.Rat)
		if vatType == 1 && vatRate.Sign() > 0 {
			priceEx = RoundHalfUp(new(big.Rat).Quo(new(big.Rat).Mul(price, hundred), hundredPlusRate), 2)
			lineVat = RoundHalfUp(new(big.Rat).Quo(new(big.Rat).Mul(lineSum, vatRate), hundredPlusRate), 2)
			sumEx = new(big.Rat).Sub(lineSum, lineVat)
		} else if (vatType == 0 || vatType == 2) && vatRate.Sign() > 0 {
			lineVat = RoundHalfUp(new(big.Rat).Quo(new(big.Rat).Mul(lineSum, vatRate), hundred), 2)
		}

		outLines[i] = LineCalcOutput{
			Qty:              FormatRat(qty, 2),
			Price:            FormatRat(price, 2),
			PriceExcludeVat:  FormatRat(priceEx, 2),
			DiscountAmount:   FormatRat(disc, 2),
			SumAmount:        FormatRat(lineSum, 2),
			SumAmountExclVat: FormatRat(sumEx, 2),
			VatValue:         FormatRat(lineVat, 2),
			SumRat:           lineSum,
		}
	}

	discRat := new(big.Rat)
	if billDiscount != nil && billDiscount.Sign() > 0 {
		discRat.Set(billDiscount)
	}
	if discRat.Cmp(totalValRat) > 0 {
		discRat.Set(totalValRat)
	}
	discRat = RoundHalfUp(discRat, 2)

	netAfterDisc := new(big.Rat).Sub(totalValRat, discRat)
	if netAfterDisc.Sign() < 0 {
		netAfterDisc.SetInt64(0)
	}
	netAfterDisc = RoundHalfUp(netAfterDisc, 2)

	var beforeVat, vatVal, totalAmt *big.Rat
	switch {
	case vatType == 3 || vatRate.Sign() == 0:
		beforeVat = new(big.Rat).Set(netAfterDisc)
		vatVal = new(big.Rat)
		totalAmt = new(big.Rat).Set(netAfterDisc)
	case vatType == 0 || vatType == 2:
		// VAT excluded (แยกนอก)
		beforeVat = new(big.Rat).Set(netAfterDisc)
		vatVal = RoundHalfUp(new(big.Rat).Quo(new(big.Rat).Mul(beforeVat, vatRate), hundred), 2)
		totalAmt = new(big.Rat).Add(beforeVat, vatVal)
	default:
		// VAT included (รวมใน, vatType == 1)
		totalAmt = new(big.Rat).Set(netAfterDisc)
		vatVal = RoundHalfUp(new(big.Rat).Quo(new(big.Rat).Mul(totalAmt, vatRate), hundredPlusRate), 2)
		beforeVat = new(big.Rat).Sub(totalAmt, vatVal)
	}

	return BillCalcTotals{
		TotalValue:     FormatRat(totalValRat, 2),
		TotalDiscount:  FormatRat(discRat, 2),
		TotalBeforeVat: FormatRat(beforeVat, 2),
		TotalVatValue:  FormatRat(vatVal, 2),
		TotalAfterVat:  FormatRat(totalAmt, 2),
		TotalExceptVat: "0.00",
		TotalAmount:    FormatRat(totalAmt, 2),
		Lines:          outLines,
	}
}

type PaymentInput struct {
	Method string
	Amount *big.Rat
}

type PaymentBreakdown struct {
	TotalAmount    string
	NetCash        string
	PayCash        string
	MoneyChange    string
	NetTransfer    string
	NetCard        string
	NetWallet      string
	NetBankTotal   string // NetTransfer + NetCard + NetWallet (posted to 11120)
	PrimaryMethod  string
}

// CalcPaymentBreakdown splits tender methods and computes exact change using *big.Rat.
func CalcPaymentBreakdown(totalAmt *big.Rat, payments []PaymentInput) (PaymentBreakdown, error) {
	totalRat := RoundHalfUp(totalAmt, 2)
	payCash := new(big.Rat)
	trf := new(big.Rat)
	wal := new(big.Rat)
	card := new(big.Rat)

	methodLabel := ""
	for _, p := range payments {
		amt := RoundHalfUp(p.Amount, 2)
		if amt.Sign() <= 0 {
			continue
		}
		m := strings.ToUpper(strings.TrimSpace(p.Method))
		if m == "" {
			m = "CASH"
		}
		if methodLabel == "" {
			methodLabel = m
		} else if methodLabel != m {
			methodLabel = "MIXED"
		}
		switch m {
		case "TRANSFER", "BANK":
			trf.Add(trf, amt)
		case "PROMPTPAY", "QR", "WALLET", "THAIFI_WALLET":
			wal.Add(wal, amt)
		case "CARD", "CREDIT_CARD", "CREDIT":
			card.Add(card, amt)
		default:
			payCash.Add(payCash, amt)
		}
	}

	// If no payment rows were provided, default to exact CASH payment (Solo-Owner 1-click checkout)
	totalPaid := new(big.Rat).Add(new(big.Rat).Add(payCash, trf), new(big.Rat).Add(wal, card))
	if totalPaid.Sign() == 0 && totalRat.Sign() > 0 {
		payCash.Set(totalRat)
		totalPaid.Set(totalRat)
		methodLabel = "CASH"
	}
	if methodLabel == "" {
		methodLabel = "CASH"
	}

	if totalPaid.Cmp(totalRat) < 0 {
		return PaymentBreakdown{}, fmt.Errorf("ยอดรับชำระ %s น้อยกว่ายอดสุทธิ %s", FormatRat(totalPaid, 2), FormatRat(totalRat, 2))
	}

	remaining := new(big.Rat).Set(totalRat)
	take := func(v *big.Rat) *big.Rat {
		if v.Cmp(remaining) > 0 {
			out := new(big.Rat).Set(remaining)
			remaining.SetInt64(0)
			return out
		}
		remaining.Sub(remaining, v)
		return new(big.Rat).Set(v)
	}
	netTrf := take(trf)
	netWal := take(wal)
	netCard := take(card)
	netCash := new(big.Rat).Set(remaining)

	nonCash := new(big.Rat).Add(netTrf, new(big.Rat).Add(netWal, netCard))
	change := new(big.Rat).Sub(new(big.Rat).Add(payCash, nonCash), totalRat)
	if change.Sign() < 0 {
		change.SetInt64(0)
	}

	return PaymentBreakdown{
		TotalAmount:   FormatRat(totalRat, 2),
		NetCash:       FormatRat(netCash, 2),
		PayCash:       FormatRat(payCash, 2),
		MoneyChange:   FormatRat(change, 2),
		NetTransfer:   FormatRat(netTrf, 2),
		NetCard:       FormatRat(netCard, 2),
		NetWallet:     FormatRat(netWal, 2),
		NetBankTotal:  FormatRat(nonCash, 2),
		PrimaryMethod: methodLabel,
	}, nil
}

type GLLine struct {
	AccountCode   string `json:"account_code"`
	AccountName   string `json:"account_name"`
	DebitOrCredit int    `json:"debit_or_credit"` // 0 = Debit, 1 = Credit
	Debit         string `json:"debit"`
	Credit        string `json:"credit"`
}

// BuildPosSaleGLLines builds the balanced double-entry GL lines for a POS sale:
// Dr 11110 เงินสด (NetCash)
// Dr 11120 เงินฝากธนาคาร (NetBankTotal = QR/Transfer/Card/Wallet)
// Cr 41100 รายได้จากการขาย (TotalBeforeVat)
// Cr 21340 ภาษีขาย (TotalVatValue)
func BuildPosSaleGLLines(totals BillCalcTotals, pay PaymentBreakdown) ([]GLLine, string, error) {
	var lines []GLLine

	cashRat := ParseRat(pay.NetCash)
	bankRat := ParseRat(pay.NetBankTotal)
	beforeVatRat := ParseRat(totals.TotalBeforeVat)
	vatRat := ParseRat(totals.TotalVatValue)

	if cashRat.Sign() > 0 {
		lines = append(lines, GLLine{
			AccountCode:   "11110",
			AccountName:   "เงินสด",
			DebitOrCredit: 0,
			Debit:         FormatRat(cashRat, 2),
			Credit:        "0.00",
		})
	}
	if bankRat.Sign() > 0 {
		lines = append(lines, GLLine{
			AccountCode:   "11120",
			AccountName:   "เงินฝากธนาคาร",
			DebitOrCredit: 0,
			Debit:         FormatRat(bankRat, 2),
			Credit:        "0.00",
		})
	}
	if beforeVatRat.Sign() > 0 {
		lines = append(lines, GLLine{
			AccountCode:   "41100",
			AccountName:   "รายได้จากการขาย",
			DebitOrCredit: 1,
			Debit:         "0.00",
			Credit:        FormatRat(beforeVatRat, 2),
		})
	}
	if vatRat.Sign() > 0 {
		lines = append(lines, GLLine{
			AccountCode:   "21340",
			AccountName:   "ภาษีขาย",
			DebitOrCredit: 1,
			Debit:         "0.00",
			Credit:        FormatRat(vatRat, 2),
		})
	}

	sumStr, err := ValidateAndBalanceGL(lines)
	if err != nil {
		return nil, "0.00", err
	}
	return lines, sumStr, nil
}

// ReverseGLLines creates an exact reversal of GL lines (swapping Debit and Credit).
func ReverseGLLines(orig []GLLine) ([]GLLine, string, error) {
	rev := make([]GLLine, len(orig))
	for i, l := range orig {
		dc := 0
		if l.DebitOrCredit == 0 {
			dc = 1
		}
		rev[i] = GLLine{
			AccountCode:   l.AccountCode,
			AccountName:   l.AccountName,
			DebitOrCredit: dc,
			Debit:         l.Credit,
			Credit:        l.Debit,
		}
	}
	sumStr, err := ValidateAndBalanceGL(rev)
	if err != nil {
		return nil, "0.00", err
	}
	return rev, sumStr, nil
}

// ValidateAndBalanceGL ensures len(lines) > 0 and SUM(Debit) == SUM(Credit) at 2 decimal places.
func ValidateAndBalanceGL(lines []GLLine) (string, error) {
	if len(lines) == 0 {
		return "0.00", ErrUnbalancedJournal
	}
	sumDr := new(big.Rat)
	sumCr := new(big.Rat)
	for _, l := range lines {
		sumDr.Add(sumDr, RoundHalfUp(ParseRat(l.Debit), 2))
		sumCr.Add(sumCr, RoundHalfUp(ParseRat(l.Credit), 2))
	}
	sumDr = RoundHalfUp(sumDr, 2)
	sumCr = RoundHalfUp(sumCr, 2)
	if !EqualAtScale(sumDr, sumCr, 2) || sumDr.Sign() <= 0 {
		return FormatRat(sumDr, 2), fmt.Errorf("%w: debit=%s credit=%s", ErrUnbalancedJournal, FormatRat(sumDr, 2), FormatRat(sumCr, 2))
	}
	return FormatRat(sumDr, 2), nil
}

// CalcPointsEarned computes floor(totalAmount / bahtPerPoint) using exact *big.Rat integer division.
func CalcPointsEarned(totalAmountStr, bahtPerPointStr string) int64 {
	tot := ParseRat(totalAmountStr)
	bpp := ParseRat(bahtPerPointStr)
	if tot.Sign() <= 0 {
		return 0
	}
	if bpp.Sign() <= 0 {
		bpp = big.NewRat(100, 1)
	}
	q := new(big.Rat).Quo(tot, bpp)
	pts := new(big.Int).Quo(q.Num(), q.Denom())
	if pts.Sign() < 0 {
		return 0
	}
	return pts.Int64()
}
