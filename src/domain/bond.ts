import { Schema } from "effect";
import { CalendarDay, Decimal, Isin, SeriesCode, Tenor } from "./primitives.ts";

/** CONTEXT.md "Family". */
export const Family = Schema.Literals(["savings", "wholesale"]).annotate({ identifier: "Family" });
export type Family = typeof Family.Type;

export const SavingsBondTypeCode = Schema.Literals([
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
]).annotate({ identifier: "SavingsBondTypeCode" });
export type SavingsBondTypeCode = typeof SavingsBondTypeCode.Type;

export const WholesaleBondTypeCode = Schema.Literals([
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
]).annotate({ identifier: "WholesaleBondTypeCode" });
export type WholesaleBondTypeCode = typeof WholesaleBondTypeCode.Type;

export const BondTypeCode = Schema.Union([SavingsBondTypeCode, WholesaleBondTypeCode]).annotate({
  identifier: "BondTypeCode",
});
export type BondTypeCode = typeof BondTypeCode.Type;

export const RateKind = Schema.Literals(["fixed", "floating", "inflation-indexed"]).annotate({
  identifier: "RateKind",
});

/** Whether a type's nominal is indexed to inflation (IZ) or stays at face value. */
export const NominalKind = Schema.Literals(["fixed", "inflation-indexed"]).annotate({
  identifier: "NominalKind",
});

/** What a letter of issue says about every Series of a type (CONTEXT.md "Bond Type"). */
export class BondType extends Schema.Class<BondType>("BondType")({
  code: BondTypeCode,
  family: Family,
  /** The Ministry's own English wording for the type. */
  description: Schema.String,
  rate: RateKind,
  nominal: NominalKind,
  /** Interest is added to the nominal each period (else paid out to the holder). */
  capitalises: Schema.Boolean,
}) {}

/**
 * How long a regular Coupon Period is: `P1Y`, `P1M`, `P6M`. For a Savings Bond it is the letter of
 * issue's; for a Wholesale Bond it is read off the dated periods (the most common span, rounded
 * to whole months) — one of the two figures in this API not copied from a cell (see `issueDay`).
 */
const PeriodLength = Tenor;

/** The one Coupon Rate a fixed-rate Series carries for its whole life. */
export const FixedCoupon = Schema.Struct({
  schedule: Schema.Literal("fixed"),
  rate: Decimal,
  periodLength: PeriodLength,
});

/** One announced Coupon Rate. Periods the Ministry has not announced are simply absent. */
export class PeriodCouponRate extends Schema.Class<PeriodCouponRate>("PeriodCouponRate")({
  /** 1-based Coupon Period counted from the purchase day. */
  period: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  rate: Decimal,
}) {}

/**
 * Coupon Rates announced one Coupon Period at a time. `rates` holds only what the Ministry has
 * announced; a missing period is Not Yet Announced (CONTEXT.md), never zero.
 */
export const PerPeriodCoupon = Schema.Struct({
  schedule: Schema.Literal("per-period"),
  periodLength: PeriodLength,
  rates: Schema.Array(PeriodCouponRate),
  /** The spread the letter of issue adds to the reference (CONTEXT.md "Margin"). */
  margin: Schema.OptionFromNullOr(Decimal),
  /** The factor applied to the reference rate (CONTEXT.md "Multiplier"; TOZ only). */
  multiplier: Schema.OptionFromNullOr(Decimal),
});

export const Coupon = Schema.Union([FixedCoupon, PerPeriodCoupon]).annotate({
  identifier: "Coupon",
});
export type Coupon = typeof Coupon.Type;

export class SaleWindow extends Schema.Class<SaleWindow>("SaleWindow")({
  from: CalendarDay,
  to: CalendarDay,
}) {}

/** One issue of a Savings Bond type (CONTEXT.md "Series"): sale terms and coupon. */
export class SavingsBondSeries extends Schema.Class<SavingsBondSeries>("SavingsBondSeries")({
  family: Schema.Literal("savings"),
  code: SeriesCode,
  type: SavingsBondTypeCode,
  isin: Isin,
  /** Maturity as the Ministry states it: so long after the purchase day. */
  tenor: Tenor,
  saleWindow: SaleWindow,
  /** Per bond of nominal 100. */
  issuePrice: Decimal,
  /**
   * Per bond of nominal 100, for a buyer switching from a maturing Series; absent when not offered.
   * `swapPrice` would read more naturally, but "switching price" is the Ministry's own English for
   * _cena zamiany_, so we keep theirs.
   */
  switchingPrice: Schema.OptionFromNullOr(Decimal),
  /** Total sold in the Sale Window, in millions of PLN; absent while the window is open. */
  totalSaleMlnPln: Schema.OptionFromNullOr(Decimal),
  /** Of the total, how much came from switching, in millions of PLN. */
  switchedMlnPln: Schema.OptionFromNullOr(Decimal),
  coupon: Coupon,
}) {}

export class DatedCouponPeriod extends Schema.Class<DatedCouponPeriod>("DatedCouponPeriod")({
  /** 1-based, in the order the letter of issue lists them. */
  period: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  start: CalendarDay,
  end: CalendarDay,
  recordDay: CalendarDay,
  paymentDate: CalendarDay,
}) {}

/** One Wholesale Bond Series (CONTEXT.md "Series"): its terms as the letter of issue fixed them. */
export class WholesaleBondSeries extends Schema.Class<WholesaleBondSeries>("WholesaleBondSeries")({
  family: Schema.Literal("wholesale"),
  code: SeriesCode,
  type: WholesaleBondTypeCode,
  isin: Isin,
  /**
   * The day the bond was issued. Stated in the file only for IZ; for every other type it is the
   * first Coupon Period's start — one of the two figures in this API not copied from a cell (see
   * `periodLength`).
   */
  issueDay: CalendarDay,
  maturity: CalendarDay,
  coupon: Coupon,
  /** The Base Reference Index the letter of issue fixed, for types whose nominal is indexed. */
  baseReferenceIndex: Schema.OptionFromNullOr(Decimal),
  couponPeriods: Schema.Array(DatedCouponPeriod),
}) {}

export const BondSeries = Schema.Union([SavingsBondSeries, WholesaleBondSeries]).annotate({
  identifier: "BondSeries",
});
export type BondSeries = typeof BondSeries.Type;
