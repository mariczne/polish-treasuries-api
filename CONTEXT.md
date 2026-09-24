# Polish Treasuries

The terms of Polish Treasury bonds and the inflation figures used to index them, exactly as the
Ministry of Finance publishes them in its spreadsheets — served as an ordinary documented API.
Nothing here is calculated: every figure is one the Ministry wrote down, at most re-expressed
(millions of PLN as PLN). Vocabulary follows the Ministry's letters of issue (_listy emisyjne_), in
English, and coincides with the German and Japanese conventions for the same constructs. Where the
Polish is not obvious, _Polish_ gives the Ministry's wording as its files and letters use it, so it
can be recognised at the source; in code and docs, use the English term.

## Language

### Bonds

**Series**:
One issue of bonds, known by its Series Name and carrying an ISIN. For a Savings Bond, one
month's sale: everyone who bought that month holds the same Series with the same terms. For a
Wholesale Bond, one line of bonds, reopened at auction after auction.
_Polish_: _seria_
_Avoid_: issue, ticker, tranche, line, bond (for the row)

**Series Name**:
The Ministry's name for a Series: its Series Prefix followed by the month and year of maturity
(`EDO0734` matures in July 2034, `DS1034` in October 2034). For a Savings Bond the month and year
are nominal — the Series matures a tenor after each buyer's purchase day.
_Polish_: _seria_ (the column header), _nazwa skrócona_ (in the letter of issue); the Ministry
describes the format as `XXMMRR`
_Avoid_: code, symbol, ticker

**Series Prefix**:
The letters of a Series Name (`EDO`, `DS`). For a Savings Bond it names a product whose letters
of issue repeat the same terms month after month: tenor, how the coupon is set, whether interest
capitalises. For a Wholesale Bond it only groups lines by coupon structure and original tenor;
each Series' letter of issue sets its own terms. Either way, the terms are served on the Series.
Savings: OTS, ROR, DOR, TOS, COI, EDO, ROS, ROD (sold today), DOS, TOZ, POS (retired); KOS, IR, RS,
TZ, SP (not read). Wholesale: IZ; OS, PS, DS, WS, AS, TK, CK, PK, DK, SP (fixed rate); TZ, WZ, DZ,
PP, NZ (floating rate).
_Polish_: _symbol_ or _rodzaj obligacji_ (savings), _typ papieru_ (wholesale). The letters expand
to the product's name, e.g. EDO — _emerytalne dziesięcioletnie oszczędnościowe obligacje skarbowe
o oprocentowaniu indeksowanym inflacją_
_Avoid_: type, kind, product, class, bond type, series (for the Series Prefix), inflation-linked bond
(for IZ alone — EDO, COI, ROS and ROD are inflation-indexed too, in their coupon)

**Family**:
Which of the Ministry's two offerings a Series belongs to: Savings Bond or Wholesale Bond.
_Avoid_: market, segment, category

**Savings Bond**:
The Family of bonds offered to individuals — everything the Ministry's retail-bonds file lists,
from the 1990s issues sold by subscription and auction to today's monthly Series at face value
100 PLN through issue agents. The Ministry's own English for _obligacje oszczędnościowe_. The
client's purchase day within a Sale Window is the client's business, not a concept here.
_Polish_: _obligacje oszczędnościowe_, also _detaliczne_ (as in the file name)
_Avoid_: retail bond

**Wholesale Bond**:
The Family of bonds sold at auction to financial institutions and traded on a market, nominal
1000 PLN: IZ, whose nominal is indexed by the Indexation Coefficient and whose Series carry a
Base Reference Index; the fixed-rate OS, PS, DS, WS and their predecessors; the floating-rate WZ,
TZ, DZ, PP, NZ. Every Coupon Period is dated.
_Polish_: _obligacje hurtowe_; in the calculator, the sheets _Indeksowane_ (IZ), _Stałe_ (fixed),
_Zmienne_ (floating)
_Avoid_: T-bond (alone), market bond, linker

### Terms of a Series

**Coupon Period**:
The n-th interval of a Series over which one Coupon Rate applies; its length (a year, a month,
a half-year) is fixed by the letter of issue. For a Wholesale Bond it is fully dated — from, to,
record date, payment date. For a Savings Bond it is only an ordinal, because its dates hang off
the buyer's purchase day.
_Polish_: _okres odsetkowy_; columns _w 1. roku_, _w 1. okresie_ (savings) and _Kupon #01_
(wholesale), dated by _Początek okresu_ (from), _Koniec okresu_ (to), _Dzień ustalenia praw_
(record date), _Data wymagalności_ (payment date)
_Avoid_: interest period, year (alone), kupon

**Coupon Rate**:
The annual rate of one Coupon Period as the Ministry announced it, a fraction of nominal
(`0.068`). For IZ, the real coupon fixed in the letter of issue.
_Polish_: _oprocentowanie_; a fixed-rate wholesale Series' one rate is headed _Kupon_. Not
_Odsetki_, which is the interest in PLN
_Avoid_: interest rate, yield, coupon (for the rate)

**Not Yet Announced**:
A Coupon Period the Ministry has not yet given a rate for. An absence — never zero, never a
placeholder. EDO0734 has three Coupon Rates and seven Not Yet Announced.
_Polish_: none — a blank or `-` cell; in _Zmienne_, the text `POLSTR` (the reference the rate will
follow)
_Avoid_: null, missing, TBD, empty

**Margin**:
The fixed spread a letter of issue adds to the reference to set a Series' Coupon Rate after the
first period (`0.02` for EDO0734): inflation for COI, EDO, ROS, ROD; the NBP reference rate for
ROR, DOR. The file names neither reference; they are the letters' own. A term of the Series; the
resulting Coupon Rates are read from the Ministry, never worked out from the Margin here.
_Polish_: _marża_; the NBP reference rate is _stopa referencyjna NBP_
_Avoid_: spread, premium

**Multiplier**:
The factor a letter of issue applies to the reference rate for a floating Series (TOZ); the
Ministry's _mnożnik_, which its own Dictionary sheet mistranslates as "Margin".
_Polish_: _mnożnik_
_Avoid_: margin (for the multiplier), factor, coefficient

**Sale Window**:
The first and last day a Savings Bond Series was on sale — one calendar month for today's
Series Prefixes. Together with Issue Price and Switching Price, the Series' sale terms.
_Polish_: _Początek sprzedaży_, _Koniec sprzedaży_ (the Dictionary sheet: "Sale beginning/end")
_Avoid_: subscription (a different, 1990s channel), offer period, sale beginning/end (as terms)

**Issue Price**:
What a buyer paid per bond of nominal 100 during the Sale Window (`100`, or `99.9` at a
discount).
_Polish_: _cena emisyjna_
_Avoid_: price (alone)

**Switching Price**:
The Issue Price for a buyer rolling a maturing Savings Bond into this Series — the Ministry's own
English for _cena zamiany_. Absent when switching was not offered.
_Polish_: _cena zamiany_; the amount switched is _w tym zamiana_
_Avoid_: exchange price, rollover price, conversion price

**Maturity**:
When a Series is redeemed, as the Ministry states it: a date for a Wholesale Bond; for a Savings
Bond a tenor counted from the buyer's purchase day ("10 years from day of purchase"), which
this service does not resolve to a date. The tenor is a term of the Series, not only of its
Series Prefix: POS ran ten and twelve months.
_Polish_: _Data wykupu_ (savings file; "10 lat/a od dnia zakupu"), _Wykup_ (calculator; a date)
_Avoid_: redemption date (for the rule), tenor (for the date)

### Inflation indexation

**Monthly Reference Index**:
One month's change in consumer prices, as a rate (`-0.004`), as the Ministry fixed it for indexing
bonds when GUS first announced it. Never corrected — a later GUS revision does not touch it, by
the letter of issue. One figure per month since July 2003.
_Polish_: _wskaźnik referencyjny_, WRₖ (sheet _Dane CPI_)
_Avoid_: CPI m/m, monthly inflation, GUS CPI

**Reference Index**:
The level consumer prices have reached in a month, chained from every Monthly Reference Index
since July 2003 (June 2003 = 100), to five decimals as the Ministry publishes it.
_Polish_: Wₙ, headed _wskaźnik miesięczny_ in _Dane CPI_ — not the "monthly" figure, despite the
name; that is WRₖ
_Avoid_: index (alone), inflation index, cumulative index, Reference CPI

**Base Reference Index**:
The Reference Index fixed in a bond's letter of issue as the starting point of its indexation.
A term of the bond, beside its coupon and maturity.
_Polish_: _bazowy wskaźnik referencyjny_, WB
_Avoid_: base index, base CPI, inflation base

**Indexation Coefficient**:
The Reference Index for a day over the Base Reference Index — how far prices have moved since
issue. Derived from the two by the Ministry's rule; this service does not serve it, clients
compute it from the figures above.
_Rule_: for day d of month m, which has D days,
SI = round₅((W₍ₘ₋₃₎ + (d−1)/D · (W₍ₘ₋₂₎ − W₍ₘ₋₃₎)) / WB), with W the Reference Index as published
(five decimals) and WB the Base Reference Index. The numerator is the Reference Index of three
months before, moved day by day toward that of two months before. The Reference Index itself is
Wₙ = 100 · ∏(1 + WRₖ), rounded half-up to five decimals.
_Polish_: SI, the letter's symbol
_Avoid_: index ratio, indexation (alone), coefficient (alone)

**Substitute Index**:
The figure the Ministry uses in place of a Monthly Reference Index when GUS has not announced it
in time. Indistinguishable in the Ministry's series from an announced one; never computed here.
_Polish_: WZₙ, the letter's symbol
_Avoid_: replacement index, fallback
