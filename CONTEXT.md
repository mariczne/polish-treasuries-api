# Polish Treasuries

The terms of Polish Treasury bonds and the inflation figures used to index them, exactly as the
Ministry of Finance publishes them in its spreadsheets — served as an ordinary documented API.
Nothing here is computed: every figure is one the Ministry wrote down. Vocabulary follows the
Ministry's letters of issue (_listy emisyjne_), in English, and coincides with the German and
Japanese conventions for the same constructs. Where the Polish is not obvious, _Polish_ gives the
Ministry's wording as its files and letters use it, so it can be recognised at the source; in code
and docs, use the English term.

## Language

### Bonds

**Series**:
One issue of one Bond Type, known by the code the Ministry gives it (`EDO0734`, `IZ0836`) and
carrying an ISIN. For a Savings Bond, the month's issue: everyone who bought that month holds
the same Series with the same terms.
_Polish_: _seria_
_Avoid_: issue, ticker, tranche, bond (for the row)

**Bond Type**:
A template of terms a letter of issue instantiates issue after issue: a family, a tenor, how the
coupon is set (fixed, floating, or indexed to inflation), whether the nominal is indexed to
inflation, and whether interest is paid out or capitalised. Savings: OTS, ROR, DOR, TOS, COI,
EDO, ROS, ROD (sold today), DOS, TOZ, POS (retired) — described; KOS, IR, RS, TZ, SP — named
only. Wholesale: IZ; OS, PS, DS, WS, AS, TK, CK, PK, DK, SP (fixed rate); TZ, WZ, DZ, PP, NZ
(floating rate) — all described.
_Polish_: the code expands to the name, e.g. EDO — _emerytalne dziesięcioletnie oszczędnościowe
obligacje skarbowe o oprocentowaniu indeksowanym inflacją_; _o stałej stopie procentowej_ (fixed),
_o zmiennej stopie procentowej_ (floating)
_Avoid_: kind, product, class, series (for the type), inflation-linked bond (for IZ alone —
EDO, COI, ROS and ROD are inflation-indexed too, in their coupon)

**Family**:
Which of the Ministry's two offerings a Bond Type belongs to: Savings Bond or Wholesale Bond.
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
a half-year) is fixed by the Bond Type. For a Wholesale Bond it is fully dated — start, end,
record day, payment date. For a Savings Bond it is only an ordinal, because its dates hang off
the buyer's purchase day.
_Polish_: _okres odsetkowy_; columns _w 1. roku_, _w 1. okresie_ (savings) and _Kupon #01_
(wholesale), dated by _Początek okresu_ (start), _Koniec okresu_ (end), _Dzień ustalenia praw_
(record day), _Data wymagalności_ (payment date)
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
The fixed spread a letter of issue adds to the reference (inflation, or the NBP rate) to set a
Series' Coupon Rate after the first period (`0.02` for EDO0734). A term of the Series; the
resulting Coupon Rates are read from the Ministry, never worked out from the Margin here.
_Polish_: _marża_
_Avoid_: spread, premium

**Multiplier**:
The factor a letter of issue applies to the reference rate for a floating Series (TOZ); the
Ministry's _mnożnik_, which its own Dictionary sheet mistranslates as "Margin".
_Polish_: _mnożnik_
_Avoid_: margin (for the multiplier), factor, coefficient

**Sale Window**:
The first and last day a Savings Bond Series was on sale — one calendar month for today's
types. Together with Issue Price and Switching Price, the Series' sale terms.
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
this service does not resolve to a date. The tenor is a term of the Series, not only of the
type: POS ran ten and twelve months.
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
