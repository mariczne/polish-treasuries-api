import type { BondSeries } from "../domain/bond.ts";
import type { InflationMonth } from "../domain/reference-index.ts";
import type { Health } from "./api.ts";

// Response examples for the docs, as served from fixtures/

export const bondsExample: ReadonlyArray<typeof BondSeries.Encoded> = [
  {
    family: "savings",
    series: "EDO0734",
    prefix: "EDO",
    isin: "PL0000117081",
    tenor: "P10Y",
    saleWindow: { from: "2024-07-01", to: "2024-07-31" },
    issuePrice: "100",
    switchingPrice: "99.6",
    sales: { total: "753871100", switched: "40921400" },
    nominal: { indexation: "none" },
    coupon: {
      schedule: "per-period",
      periodLength: "P1Y",
      rates: [
        { period: 1, rate: "0.068" },
        { period: 2, rate: "0.06" },
        { period: 3, rate: "0.051" },
      ],
      reference: "inflation",
      margin: "0.02",
    },
  },
  {
    family: "wholesale",
    series: "IZ0831",
    prefix: "IZ",
    isin: "PL0000117743",
    issueDate: "2024-08-25",
    maturityDate: "2031-08-25",
    nominal: { indexation: "inflation", baseReferenceIndex: "199.53428" },
    coupon: { schedule: "fixed", rate: "0.0175", periodLength: "P1Y" },
    couponPeriods: [
      {
        period: 1,
        from: "2024-08-25",
        to: "2025-08-25",
        recordDate: "2025-08-21",
        paymentDate: "2025-08-25",
      },
      {
        period: 2,
        from: "2025-08-25",
        to: "2026-08-25",
        recordDate: "2026-08-21",
        paymentDate: "2026-08-25",
      },
      {
        period: 3,
        from: "2026-08-25",
        to: "2027-08-25",
        recordDate: "2027-08-23",
        paymentDate: "2027-08-25",
      },
      {
        period: 4,
        from: "2027-08-25",
        to: "2028-08-25",
        recordDate: "2028-08-23",
        paymentDate: "2028-08-25",
      },
      {
        period: 5,
        from: "2028-08-25",
        to: "2029-08-25",
        recordDate: "2029-08-23",
        paymentDate: "2029-08-27",
      },
      {
        period: 6,
        from: "2029-08-25",
        to: "2030-08-25",
        recordDate: "2030-08-22",
        paymentDate: "2030-08-26",
      },
      {
        period: 7,
        from: "2030-08-25",
        to: "2031-08-25",
        recordDate: "2031-08-21",
        paymentDate: "2031-08-25",
      },
    ],
  },
];

export const inflationExample: ReadonlyArray<typeof InflationMonth.Encoded> = [
  { month: "2026-07", rate: "0.008", referenceIndex: "214.62133" },
  { month: "2026-08", rate: "0.003", referenceIndex: "215.26519" },
];

export const healthExample: typeof Health.Encoded = {
  status: "ok",
  monthCount: 278,
  latestMonth: "2026-08",
  prefixCount: 27,
  seriesCount: 1731,
  files: [
    {
      file: "kalkulatorodsetek.xlsm",
      source: "download",
      loadedAt: "2026-09-24T03:00:00.000Z",
      lastAttemptAt: "2026-09-25T03:00:00.000Z",
      lastAttempt: "unchanged",
      message: null,
    },
    {
      file: "Dane_dotyczace_obligacji_detalicznych.xls",
      source: "download",
      loadedAt: "2026-09-24T03:00:00.000Z",
      lastAttemptAt: "2026-09-25T03:00:00.000Z",
      lastAttempt: "unchanged",
      message: null,
    },
  ],
};
