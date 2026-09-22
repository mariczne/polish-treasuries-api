import type { Schema } from "effect";

/**
 * A list of records as a spreadsheet would show it: one row per record, nested fields spread into
 * dotted columns (`saleWindow.from`), lists spread by position (`couponPeriods.1.start`) — or, for
 * lists of Coupon Periods, by the period number the Ministry announced them under
 * (`coupon.rates.3.rate`), so `/bonds/by-type/EDO.csv` reads like the Ministry's EDO sheet.
 * Columns appear in the order they are first seen; a record that lacks a column leaves it blank.
 */

export type Format = "csv" | "tsv";

type Json = Schema.Json;

export const tabular = (rows: ReadonlyArray<Json>, format: Format): string => {
  const flat = rows.map((row) => flatten(row));
  const columns: Array<string> = [];
  const seen = new Set<string>();
  for (const row of flat) {
    for (const key of row.keys()) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const separator = format === "csv" ? "," : "\t";
  const cell = format === "csv" ? csvCell : tsvCell;
  const lines = [columns.map(cell).join(separator)];
  for (const row of flat) {
    lines.push(columns.map((column) => cell(row.get(column) ?? "")).join(separator));
  }
  return `${lines.join("\r\n")}\r\n`;
};

export const contentType = (format: Format) =>
  format === "csv" ? "text/csv; charset=utf-8" : "text/tab-separated-values; charset=utf-8";

const flatten = (
  value: Json,
  prefix = "",
  into = new Map<string, string>(),
): Map<string, string> => {
  if (value === null) {
    if (prefix !== "") into.set(prefix, "");
  } else if (Array.isArray(value)) {
    const periods = value.map(periodOf);
    const byPeriod = periods.every((period) => period !== null);
    value.forEach((item, i) => {
      const period = periods[i];
      const index = byPeriod && period !== null ? String(period) : String(i + 1);
      const rest = byPeriod && isObject(item) ? withoutKey(item, "period") : item;
      flatten(rest, join(prefix, index), into);
    });
  } else if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, join(prefix, key), into);
    }
  } else {
    into.set(prefix, String(value));
  }
  return into;
};

const isObject = (value: Json): value is { readonly [key: string]: Json } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const periodOf = (item: Json) =>
  isObject(item) && typeof item["period"] === "number" ? item["period"] : null;

const withoutKey = (object: { readonly [key: string]: Json }, key: string): Json =>
  Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));

const join = (prefix: string, key: string) => (prefix === "" ? key : `${prefix}.${key}`);

const csvCell = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

const tsvCell = (text: string) => text.replace(/[\t\r\n]/g, " ");
