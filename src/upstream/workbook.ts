import { Effect, Schema } from "effect";
import * as XLSX from "xlsx";

/**
 * The only module that knows SheetJS exists. A Workbook is a set of named Sheets; a Sheet is rows
 * of Cells; a Table reads a Sheet by its header text so that a column moving does not matter and
 * a column vanishing or appearing fails loudly.
 */

/** A raw cell: text, a number (Excel serials for dates), or blank. `"-"` and `""` are blank. */
export type Cell = string | number | boolean | null;

export class WorkbookError extends Schema.TaggedError<WorkbookError>()("WorkbookError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

export class Sheet {
  readonly name: string;
  readonly rows: ReadonlyArray<ReadonlyArray<Cell>>;
  constructor(name: string, rows: ReadonlyArray<ReadonlyArray<Cell>>) {
    this.name = name;
    this.rows = rows;
  }
}

export class Workbook {
  readonly sheetNames: ReadonlyArray<string>;
  readonly #book: XLSX.WorkBook;
  private constructor(book: XLSX.WorkBook, sheetNames: ReadonlyArray<string>) {
    this.#book = book;
    this.sheetNames = sheetNames;
  }

  static readonly fromBytes = Effect.fn("Workbook.fromBytes")(function* (bytes: Uint8Array) {
    const book = yield* Effect.try({
      try: () => XLSX.read(bytes, { type: "array", cellDates: false, cellNF: false }),
      catch: (cause) =>
        new WorkbookError({ message: "The file is not a readable workbook", cause }),
    });
    if (book.Workbook?.WBProps?.date1904 === true) {
      return yield* new WorkbookError({ message: "Workbook uses the 1904 date system" });
    }
    return new Workbook(book, book.SheetNames);
  });

  readonly sheet = (name: string) => sheetOf(this.#book, name);
}

const sheetOf = Effect.fn("Workbook.sheet")(function* (book: XLSX.WorkBook, name: string) {
  const ws = book.Sheets[name];
  if (ws === undefined) {
    return yield* new WorkbookError({ message: `Sheet "${name}" is missing` });
  }
  const raw: Array<Array<unknown>> = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  });
  return new Sheet(
    name,
    raw.map((row) => row.map(toCell)),
  );
});

function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" || trimmed === "-" ? null : trimmed;
  }
  return JSON.stringify(value);
}

/**
 * A Sheet read by header text. With two header rows, a top label spanning several columns is
 * carried across the blanks and joined with the sub-label: `Oprocentowanie / w 1. roku`.
 * Every record has every column; a blank cell is `null`.
 */
export class Table {
  readonly sheet: string;
  readonly columns: ReadonlyArray<string>;
  readonly records: ReadonlyArray<Readonly<Record<string, Cell>>>;
  private constructor(
    sheet: string,
    columns: ReadonlyArray<string>,
    records: ReadonlyArray<Readonly<Record<string, Cell>>>,
  ) {
    this.sheet = sheet;
    this.columns = columns;
    this.records = records;
  }

  static readonly fromSheet = Effect.fn("Table.fromSheet")(function* (
    sheet: Sheet,
    headerRows: 1 | 2,
  ) {
    const top = sheet.rows[0];
    if (top === undefined) {
      return yield* new WorkbookError({ message: `Sheet "${sheet.name}" is empty` });
    }
    const sub = headerRows === 2 ? (sheet.rows[1] ?? []) : [];
    const width = usedWidth(sheet.rows);
    const columns: Array<string> = [];
    let carried: string | null = null;
    for (let i = 0; i < width; i++) {
      const topLabel = label(top[i]);
      if (topLabel !== null) carried = topLabel;
      const subLabel = label(sub[i]);
      const name =
        subLabel === null ? topLabel : carried === null ? subLabel : `${carried} / ${subLabel}`;
      if (name === null) {
        return yield* new WorkbookError({
          message: `Sheet "${sheet.name}": column ${i + 1} has no header`,
        });
      }
      if (columns.includes(name)) {
        return yield* new WorkbookError({
          message: `Sheet "${sheet.name}": header "${name}" appears twice`,
        });
      }
      columns.push(name);
    }
    const records = sheet.rows.slice(headerRows).map((row) => {
      const record: Record<string, Cell> = {};
      columns.forEach((column, i) => {
        record[column] = row[i] ?? null;
      });
      return record;
    });
    return new Table(sheet.name, columns, records);
  });

  /** Decodes a record (or any re-keyed subset of it) with a schema, naming the sheet and row on failure. */
  readonly decode = <S extends Schema.Top>(
    record: Readonly<Record<string, Cell>>,
    schema: S,
    row: string = String(record[this.columns[0]!] ?? "?"),
  ): Effect.Effect<S["Type"], WorkbookError, S["DecodingServices"]> =>
    Schema.decodeUnknownEffect(schema)(record as unknown).pipe(
      Effect.mapError(
        (error) =>
          new WorkbookError({ message: `Sheet "${this.sheet}", row ${row}: ${error.message}` }),
      ),
    );

  readonly decodeCell = <S extends Schema.Top>(
    record: Readonly<Record<string, Cell>>,
    column: string,
    schema: S,
  ): Effect.Effect<S["Type"], WorkbookError, S["DecodingServices"]> =>
    Schema.decodeUnknownEffect(schema)((record[column] ?? null) as unknown).pipe(
      Effect.mapError(
        (error) =>
          new WorkbookError({
            message: `Sheet "${this.sheet}", row ${String(record[this.columns[0]!] ?? "?")}, "${column}": ${error.message}`,
          }),
      ),
    );
}

/** Formatted-but-empty columns at the right edge are not columns. */
function usedWidth(rows: ReadonlyArray<ReadonlyArray<Cell>>): number {
  let width = 0;
  for (const row of rows) {
    for (let i = row.length - 1; i >= width; i--) {
      if (row[i] !== null) {
        width = i + 1;
        break;
      }
    }
  }
  return width;
}

function label(cell: Cell | undefined): string | null {
  if (typeof cell !== "string") return null;
  const collapsed = cell.replace(/\s+/g, " ").trim();
  return collapsed === "" ? null : collapsed;
}
