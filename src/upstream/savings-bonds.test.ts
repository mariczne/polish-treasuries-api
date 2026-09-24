import { describe, expect, it } from "@effect/vitest";
import { BigDecimal, Effect, Option } from "effect";
import type { SavingsCoupon } from "../domain/bond.ts";
import { fixture } from "./fixtures.ts";
import { parseSavingsBonds } from "./savings-bonds.ts";

const decimal = (s: string) => BigDecimal.fromStringUnsafe(s);
const equals = (a: BigDecimal.BigDecimal, b: string) => BigDecimal.equals(a, decimal(b));
const someEquals = (a: Option.Option<BigDecimal.BigDecimal>, b: string) =>
  Option.isSome(a) && equals(a.value, b);
const perPeriod = (coupon: SavingsCoupon) => {
  if (coupon.schedule !== "per-period")
    throw new Error(`expected PerPeriod, got ${coupon.schedule}`);
  return coupon;
};
const margin = (coupon: SavingsCoupon) => {
  const c = perPeriod(coupon);
  return "margin" in c ? `${c.reference} + ${BigDecimal.format(c.margin)}` : undefined;
};
const multiplier = (coupon: SavingsCoupon) => {
  const c = perPeriod(coupon);
  return "multiplier" in c ? BigDecimal.format(c.multiplier) : undefined;
};
const rates = (coupon: SavingsCoupon) =>
  perPeriod(coupon).rates.map((r) => [r.period, BigDecimal.format(r.rate)]);

describe("parseSavingsBonds", () => {
  const parsed = fixture("Dane_dotyczace_obligacji_detalicznych.xls").pipe(
    Effect.flatMap(parseSavingsBonds),
  );

  it.effect("carries each Series Prefix's terms on its Series", () =>
    Effect.gen(function* () {
      const { series } = yield* parsed;
      expect([...new Set(series.map((s) => s.prefix))]).toEqual([
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
      ]);
      expect(series.find((s) => s.series === "EDO0734")).toMatchObject({
        family: "savings",
        nominal: { indexation: "none" },
      });
      expect(series.find((s) => s.prefix === "ROR")?.coupon).toMatchObject({
        schedule: "per-period",
        periodLength: "P1M",
      });
    }),
  );

  it.effect("reads every Series of every Series Prefix", () =>
    Effect.gen(function* () {
      const { series } = yield* parsed;
      const count = (prefix: string) => series.filter((s) => s.prefix === prefix).length;
      expect(count("OTS")).toBe(108);
      expect(count("ROR")).toBe(52);
      expect(count("DOR")).toBe(52);
      expect(count("TOS")).toBe(50);
      expect(count("COI")).toBe(324);
      expect(count("EDO")).toBe(264);
      expect(count("ROS")).toBe(120);
      expect(count("ROD")).toBe(120);
      expect(count("DOS")).toBe(276);
      expect(count("TOZ")).toBe(123);
      expect(count("POS")).toBe(3);
      expect(new Set(series.map((s) => s.series)).size).toBe(series.length);
    }),
  );

  it.effect("EDO0734: three announced years, seven not yet announced", () =>
    Effect.gen(function* () {
      const { series } = yield* parsed;
      const edo0734 = series.find((s) => s.series === "EDO0734")!;
      expect(edo0734).toMatchObject({
        family: "savings",
        prefix: "EDO",
        isin: "PL0000117081",
        tenor: "P10Y",
        saleWindow: { from: "2024-07-01", to: "2024-07-31" },
      });
      expect(equals(edo0734.issuePrice, "100")).toBe(true);
      expect(someEquals(edo0734.switchingPrice, "99.6")).toBe(true);
      const sales = Option.getOrThrow(edo0734.sales);
      expect(BigDecimal.format(sales.total)).toBe("753871100");
      expect(someEquals(sales.switched, "40921400")).toBe(true);
      expect(perPeriod(edo0734.coupon).periodLength).toBe("P1Y");
      expect(rates(edo0734.coupon)).toEqual([
        [1, "0.068"],
        [2, "0.06"],
        [3, "0.051"],
      ]);
      expect(margin(edo0734.coupon)).toBe("inflation + 0.02");
      expect(multiplier(edo0734.coupon)).toBeUndefined();
    }),
  );

  it.effect("the month on sale is already listed with its first-period rate", () =>
    Effect.gen(function* () {
      const { series } = yield* parsed;
      const edo0936 = series.find((s) => s.series === "EDO0936")!;
      expect(edo0936.saleWindow).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
      expect(Option.isNone(edo0936.sales)).toBe(true);
      expect(rates(edo0936.coupon)).toEqual([[1, "0.0535"]]);

      const tos0929 = series.find((s) => s.series === "TOS0929")!;
      expect(tos0929.coupon.schedule === "fixed" && equals(tos0929.coupon.rate, "0.044")).toBe(
        true,
      );

      const ror0927 = series.find((s) => s.series === "ROR0927")!;
      expect(perPeriod(ror0927.coupon).periodLength).toBe("P1M");
      expect(rates(ror0927.coupon)).toEqual([[1, "0.04"]]);
      expect(margin(ror0927.coupon)).toBe("nbp-reference-rate + 0");
    }),
  );

  it.effect("finished series have every period", () =>
    Effect.gen(function* () {
      const { series } = yield* parsed;
      const edo1014 = series.find((s) => s.series === "EDO1014")!;
      expect(rates(edo1014.coupon)).toHaveLength(10);
      expect(Option.isNone(edo1014.switchingPrice)).toBe(true);

      const dor0624 = series.find((s) => s.series === "DOR0624")!;
      expect(rates(dor0624.coupon)).toHaveLength(24);
      expect(rates(dor0624.coupon)[1]).toEqual([2, "0.0625"]);

      const toz0515 = series.find((s) => s.series === "TOZ0515")!;
      expect(perPeriod(toz0515.coupon).periodLength).toBe("P6M");
      expect(rates(toz0515.coupon)).toHaveLength(6);
      expect(multiplier(toz0515.coupon)).toBe("1");
      expect(margin(toz0515.coupon)).toBeUndefined();

      const ots0118 = series.find((s) => s.series === "OTS0118")!;
      expect(ots0118.tenor).toBe("P3M");
      expect(ots0118.coupon.schedule === "fixed" && equals(ots0118.coupon.rate, "0.015")).toBe(
        true,
      );

      expect(ots0118.coupon.periodLength).toBe("P3M");
      expect(series.filter((s) => s.prefix === "POS").map((s) => s.coupon.periodLength)).toEqual([
        "P10M",
        "P10M",
        "P12M",
      ]);
      expect(series.filter((s) => s.prefix === "POS").map((s) => s.tenor)).toEqual([
        "P10M",
        "P10M",
        "P12M",
      ]);
    }),
  );
});
