import { Schema } from "effect";
import { CalendarDate, Decimal, Duration, Isin, SeriesName } from "./primitives.ts";

export const Family = Schema.Literals(["savings", "wholesale"]).annotate({ identifier: "Family" });
export type Family = typeof Family.Type;

export const SavingsSeriesPrefix = Schema.Literals([
  "OTS",
  "ROR",
  "DOR",
  "TOS",
  "COI",
  "EDO",
  "ROS",
  "ROD",
  "DOS",
  "TOZ",
  "POS",
]).annotate({ identifier: "SavingsSeriesPrefix" });
export type SavingsSeriesPrefix = typeof SavingsSeriesPrefix.Type;

export const WholesaleSeriesPrefix = Schema.Literals([
  "IZ",
  "OS",
  "PS",
  "DS",
  "WS",
  "AS",
  "TK",
  "CK",
  "PK",
  "DK",
  "SP",
  "TZ",
  "WZ",
  "DZ",
  "PP",
  "NZ",
]).annotate({ identifier: "WholesaleSeriesPrefix" });
export type WholesaleSeriesPrefix = typeof WholesaleSeriesPrefix.Type;

/** One flat list, so a filter on it documents and rejects as one enum. */
export const SeriesPrefix = Schema.Literals([
  ...SavingsSeriesPrefix.literals,
  ...WholesaleSeriesPrefix.literals,
]).annotate({
  identifier: "SeriesPrefix",
  description: "The letters of a Series Name: `EDO` in `EDO0734`",
  examples: ["EDO"],
});
export type SeriesPrefix = typeof SeriesPrefix.Type;

/** The one Coupon Rate a fixed-rate Series carries for its whole life. */
export const FixedCoupon = Schema.Struct({
  schedule: Schema.Literal("fixed"),
  rate: Decimal,
  /**
   * How long a regular Coupon Period is: `P1Y`, `P1M`, `P6M`. For a Wholesale Bond it is read off
   * the dated periods (the most common span, rounded to whole months), not copied from a cell.
   */
  periodLength: Duration,
}).annotate({ identifier: "FixedCoupon" });

/** One announced Coupon Rate. Periods the Ministry has not announced are simply absent. */
export class PeriodCouponRate extends Schema.Class<PeriodCouponRate>("PeriodCouponRate")({
  /** 1-based: counted from the purchase day for a Savings Bond, as numbered in the file for a Wholesale Bond. */
  period: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  rate: Decimal,
}) {}

/**
 * Coupon Rates announced one Coupon Period at a time. `rates` holds only what the Ministry has
 * announced; a missing period is Not Yet Announced (CONTEXT.md), never zero.
 */
const perPeriod = {
  schedule: Schema.Literal("per-period"),
  /**
   * How long a regular Coupon Period is: `P1Y`, `P1M`, `P6M`. For a Wholesale Bond it is read off
   * the dated periods (the most common span, rounded to whole months), not copied from a cell.
   */
  periodLength: Duration,
  rates: Schema.Array(PeriodCouponRate),
};

/** A floating-rate Wholesale Bond's rates; the file carries nothing about how they are set. */
export const PerPeriodCoupon = Schema.Struct(perPeriod).annotate({
  identifier: "PerPeriodCoupon",
});

/** A reference plus a Margin: inflation for COI, EDO, ROS, ROD; the NBP reference rate for ROR, DOR. */
export const MarginCoupon = Schema.Struct({
  ...perPeriod,
  reference: Schema.Literals(["inflation", "nbp-reference-rate"]),
  margin: Decimal,
}).annotate({ identifier: "MarginCoupon" });

/** The reference rate times a Multiplier (TOZ). */
export const MultiplierCoupon = Schema.Struct({
  ...perPeriod,
  multiplier: Decimal,
}).annotate({ identifier: "MultiplierCoupon" });

export const SavingsCoupon = Schema.Union([FixedCoupon, MarginCoupon, MultiplierCoupon]).annotate({
  identifier: "SavingsCoupon",
});
export type SavingsCoupon = typeof SavingsCoupon.Type;

export const WholesaleCoupon = Schema.Union([FixedCoupon, PerPeriodCoupon]).annotate({
  identifier: "WholesaleCoupon",
});
export type WholesaleCoupon = typeof WholesaleCoupon.Type;

/** The nominal stays at face value. */
export const FixedNominal = Schema.Struct({ indexation: Schema.Literal("none") }).annotate({
  identifier: "FixedNominal",
});

/** The nominal is indexed to inflation from the Base Reference Index its letter of issue fixed (IZ). */
export const IndexedNominal = Schema.Struct({
  indexation: Schema.Literal("inflation"),
  baseReferenceIndex: Decimal,
}).annotate({ identifier: "IndexedNominal" });

export const WholesaleNominal = Schema.Union([FixedNominal, IndexedNominal]).annotate({
  identifier: "WholesaleNominal",
});
export type WholesaleNominal = typeof WholesaleNominal.Type;

export class SaleWindow extends Schema.Class<SaleWindow>("SaleWindow")({
  from: CalendarDate,
  to: CalendarDate,
}) {}

/** What a Savings Bond Series sold in its Sale Window, in PLN (the file gives millions). */
export class Sales extends Schema.Class<Sales>("Sales")({
  total: Decimal,
  /** Of the total, what buyers switched in from a maturing Series; absent when switching was not offered. */
  switched: Schema.OptionFromNullOr(Decimal),
}) {}

/** One month's sale of a Savings Bond (CONTEXT.md "Series"): sale terms and coupon. */
export class SavingsBondSeries extends Schema.Class<SavingsBondSeries>("SavingsBondSeries")({
  family: Schema.Literal("savings"),
  series: SeriesName,
  prefix: SavingsSeriesPrefix,
  isin: Isin,
  /** Interest is added to the nominal each period (else paid out to the holder). */
  capitalises: Schema.Boolean,
  /** Maturity as the Ministry states it: so long after the purchase day. */
  tenor: Duration,
  saleWindow: SaleWindow,
  /** Per bond of nominal 100. */
  issuePrice: Decimal,
  /**
   * Per bond of nominal 100, for a buyer switching from a maturing Series; absent when not offered.
   * `swapPrice` would read more naturally, but "switching price" is the Ministry's own English for
   * _cena zamiany_, so we keep theirs.
   */
  switchingPrice: Schema.OptionFromNullOr(Decimal),
  /** Absent while the Sale Window is open. */
  sales: Schema.OptionFromNullOr(Sales),
  nominal: FixedNominal,
  coupon: SavingsCoupon,
}) {}

export class DatedCouponPeriod extends Schema.Class<DatedCouponPeriod>("DatedCouponPeriod")({
  /** 1-based, in the order the letter of issue lists them. */
  period: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  from: CalendarDate,
  to: CalendarDate,
  recordDate: CalendarDate,
  paymentDate: CalendarDate,
}) {}

/** One Wholesale Bond Series (CONTEXT.md "Series"): its terms as the letter of issue fixed them. */
export class WholesaleBondSeries extends Schema.Class<WholesaleBondSeries>("WholesaleBondSeries")({
  family: Schema.Literal("wholesale"),
  series: SeriesName,
  prefix: WholesaleSeriesPrefix,
  isin: Isin,
  /**
   * The day the bond was issued. Stated in the file only for IZ; for every other Series Prefix it
   * is the first Coupon Period's first day — one of the few figures in this API not copied from a cell
   * (see README).
   */
  issueDate: CalendarDate,
  maturityDate: CalendarDate,
  nominal: WholesaleNominal,
  coupon: WholesaleCoupon,
  couponPeriods: Schema.Array(DatedCouponPeriod),
}) {}

export const BondSeries = Schema.Union([SavingsBondSeries, WholesaleBondSeries]).annotate({
  identifier: "BondSeries",
});
export type BondSeries = typeof BondSeries.Type;
