import { describe, expect, it } from "@effect/vitest";
import { BigDecimal, Effect } from "effect";
import { YearMonth } from "../domain/primitives.ts";
import { parseCalculator } from "./calculator.ts";
import { fixture } from "./fixtures.ts";

const decimal = (s: string) => BigDecimal.fromStringUnsafe(s);
const equals = (a: BigDecimal.BigDecimal, b: string) => BigDecimal.equals(a, decimal(b));

describe("parseCalculator", () => {
  const parsed = fixture("kalkulatorodsetek.xlsm").pipe(Effect.flatMap(parseCalculator));

  it.effect("reads every month of the Reference Index since July 2003", () =>
    Effect.gen(function* () {
      const { referenceIndex } = yield* parsed;
      expect(referenceIndex).toHaveLength(278);
      expect(referenceIndex[0]).toMatchObject({ month: "2003-07" });
      expect(equals(referenceIndex[0]!.rate, "-0.004")).toBe(true);
      expect(equals(referenceIndex[0]!.referenceIndex, "99.6")).toBe(true);
      expect(referenceIndex.at(-1)).toMatchObject({ month: "2026-08" });
    }),
  );

  it.effect("carries the Ministry's figures to the digit", () =>
    Effect.gen(function* () {
      const { referenceIndex } = yield* parsed;
      const byMonth = new Map(referenceIndex.map((row) => [row.month, row]));
      expect(equals(byMonth.get(YearMonth.make("2026-01"))!.rate, "0.006")).toBe(true);
      expect(equals(byMonth.get(YearMonth.make("2023-06"))!.referenceIndex, "194.28509")).toBe(
        true,
      );
    }),
  );

  it.effect("reads the four IZ series with their coupon periods", () =>
    Effect.gen(function* () {
      const { series } = yield* parsed;
      const inflationLinkedBonds = series.filter((bond) => bond.prefix === "IZ");
      expect(inflationLinkedBonds.map((bond) => bond.series)).toEqual([
        "IZ0816",
        "IZ0823",
        "IZ0831",
        "IZ0836",
      ]);
      const iz0836 = inflationLinkedBonds.find((bond) => bond.series === "IZ0836")!;
      expect(iz0836).toMatchObject({
        family: "wholesale",
        prefix: "IZ",
        isin: "PL0000117024",
        issueDate: "2023-08-25",
        maturityDate: "2036-08-25",
      });
      expect(iz0836.coupon.schedule === "fixed" && equals(iz0836.coupon.rate, "0.02")).toBe(true);
      expect(
        iz0836.nominal.indexation === "inflation" &&
          equals(iz0836.nominal.baseReferenceIndex, "194.28509"),
      ).toBe(true);
      expect(iz0836.couponPeriods).toHaveLength(13);
      expect(iz0836.couponPeriods[0]).toMatchObject({
        period: 1,
        from: "2023-08-25",
        to: "2024-08-25",
      });
      expect(iz0836.couponPeriods.at(-1)).toMatchObject({
        period: 13,
        to: "2036-08-25",
        paymentDate: "2036-08-25",
      });
      const iz0816 = inflationLinkedBonds.find((bond) => bond.series === "IZ0816")!;
      expect(iz0816.couponPeriods).toHaveLength(12);
    }),
  );

  it.effect("reads the fixed-rate and floating-rate wholesale series", () =>
    Effect.gen(function* () {
      const { series } = yield* parsed;
      expect(new Set(series.map((s) => s.prefix))).toEqual(
        new Set([
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
        ]),
      );
      expect(series).toHaveLength(4 + 122 + 113);
      expect(series.some((bond) => bond.series.startsWith("PPT"))).toBe(false);

      const ws0447 = series.find((bond) => bond.series === "WS0447")!;
      expect(ws0447).toMatchObject({
        prefix: "WS",
        isin: "PL0000109765",
        maturityDate: "2047-04-25",
        issueDate: "2016-04-25",
      });
      expect(ws0447.coupon.schedule === "fixed" && equals(ws0447.coupon.rate, "0.04")).toBe(true);
      expect(ws0447.coupon.periodLength).toBe("P1Y");
      expect(series.find((b) => b.series === "IZ0836")!.coupon.periodLength).toBe("P1Y");
      expect(ws0447.nominal).toEqual({ indexation: "none" });
      expect(ws0447.couponPeriods).toHaveLength(31);

      const nz0936 = series.find((bond) => bond.series === "NZ0936")!;
      expect(nz0936.prefix).toBe("NZ");
      if (nz0936.coupon.schedule !== "per-period") throw new Error("NZ0936 should be per period");
      expect(nz0936.coupon.periodLength).toBe("P6M");
      expect(nz0936.couponPeriods.length).toBe(22);

      const lengths = (code: string) => series.find((b) => b.series === code)!.coupon.periodLength;
      expect(lengths("WZ1131")).toBe("P6M");
      expect(lengths("DZ1205")).toBe("P1Y");
      expect(lengths("TZ0897")).toBe("P3M");
      expect(nz0936.coupon.rates.length).toBeGreaterThan(0);
      expect(nz0936.coupon.rates.length).toBeLessThan(nz0936.couponPeriods.length);
      expect(equals(nz0936.coupon.rates[0]!.rate, "0.0398239")).toBe(true);
    }),
  );
});
