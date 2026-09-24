import { describe, expect, it } from "@effect/vitest";
import { tabular } from "./tabular.ts";

describe("tabular", () => {
  const rows = [
    {
      series: "EDO0734",
      saleWindow: { from: "2024-07-01", to: "2024-07-31" },
      switchingPrice: "99.6",
      coupon: {
        schedule: "per-period",
        rates: [
          { period: 1, rate: "0.068" },
          { period: 2, rate: "0.06" },
        ],
        margin: "0.02",
      },
    },
    {
      series: "TOS0929",
      saleWindow: { from: "2026-09-01", to: "2026-09-30" },
      switchingPrice: null,
      coupon: { schedule: "fixed", rate: "0.044" },
    },
  ];

  it("spreads nested fields and period lists into sheet-like columns", () => {
    expect(tabular(rows, "csv")).toBe(
      [
        "series,saleWindow.from,saleWindow.to,switchingPrice,coupon.schedule,coupon.rates.1.rate,coupon.rates.2.rate,coupon.margin,coupon.rate",
        "EDO0734,2024-07-01,2024-07-31,99.6,per-period,0.068,0.06,0.02,",
        "TOS0929,2026-09-01,2026-09-30,,fixed,,,,0.044",
        "",
      ].join("\r\n"),
    );
  });

  it("quotes CSV cells that need it and uses tabs for TSV", () => {
    const tricky = [{ name: 'He said "hi", twice', n: 1 }];
    expect(tabular(tricky, "csv")).toBe('name,n\r\n"He said ""hi"", twice",1\r\n');
    expect(tabular(tricky, "tsv")).toBe('name\tn\r\nHe said "hi", twice\t1\r\n');
  });
});
