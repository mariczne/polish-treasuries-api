import { Schema } from "effect";
import { Decimal, YearMonth } from "./primitives.ts";

/** One month of inflation (CONTEXT.md "Monthly Reference Index", "Reference Index"). */
export class InflationMonth extends Schema.Class<InflationMonth>("InflationMonth")({
  month: YearMonth,
  /** The month's price change: `-0.004` for a 0.4 % fall. */
  rate: Decimal,
  /** Cumulative level, June 2003 = 100. */
  referenceIndex: Decimal,
}) {}
