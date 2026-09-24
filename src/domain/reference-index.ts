import { Schema } from "effect";
import { Decimal, YearMonth } from "./primitives.ts";

/**
 * One month of the Ministry's inflation series (CONTEXT.md "Monthly Reference Index",
 * "Reference Index"): the month's price change as the Ministry fixed it, and the level the chain
 * had reached by then — both exactly as the Ministry's sheet carries them.
 */
export class InflationMonth extends Schema.Class<InflationMonth>("InflationMonth")({
  month: YearMonth,
  /** The month's change in consumer prices as a rate: `-0.004` for a 0.4 % fall. */
  rate: Decimal,
  /** The Reference Index for the month (June 2003 = 100), to five decimals. */
  referenceIndex: Decimal,
}) {}
