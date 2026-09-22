# polish-treasuries-api

The terms of Polish Treasury bonds and the inflation figures used to index them, **exactly as the
Ministry of Finance publishes them** in its two spreadsheets — served as a normal HTTP API with
JSON, CSV and TSV, and an OpenAPI document.

Nothing here is computed. Every number is one the Ministry wrote down. Vocabulary follows the
Ministry's own letters of issue (see [`CONTEXT.md`](CONTEXT.md)).

## Why

The Ministry publishes the coupon terms of every Treasury bond, and the month-on-month CPI
figures _as it fixed them_ for indexing bonds, only as spreadsheets attached to gov.pl pages whose
URLs change on every republish. There is no API.

GUS's own CPI file is **not** a substitute: GUS revises January every March with new weights, and
the letters of issue say a revision never changes the indexation. The Ministry's sheet is the only
public source of the first-published series. So this service downloads the Ministry's files,
understands them, and serves the data.

## Sources

| File                                                                            | Page                                                 | Updated                        |
| ------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------ |
| `kalkulatorodsetek.xlsm` — coupon calculator: the inflation series, IZ bonds    | https://www.gov.pl/web/finanse/kalkulatory2          | after GUS publishes CPI, ~15th |
| `Dane_dotyczace_obligacji_detalicznych.xls` — savings bonds, one sheet per type | https://www.gov.pl/web/finanse/obligacje-detaliczne1 | monthly, ~9th                  |

## Endpoints

Add `.csv` or `.tsv` to any path to get the same data as a table (one row per record).

```
GET /inflation                     every month since July 2003
GET /inflation/2026                one year          GET /inflation/2026-02   one month
GET /bonds                         every Series, savings and wholesale
GET /bonds/types                   the Bond Types
GET /bonds/by-type/EDO             the Series of one type
GET /bonds/EDO0734                 one Series by code
GET /bonds/by-isin/PL0000117081    by ISIN (a list: the Ministry's file has two ISINs shared by two Series each)
GET /health                        what is served, and per file how the last download went
GET /openapi.json                  the OpenAPI document      GET /docs   interactive docs
```

Conventions: decimals are strings (`"0.068"`, `"194.28509"`) so no digit is lost; days are
`YYYY-MM-DD`; tenors are ISO 8601 durations (`P10Y`); a Coupon Period the Ministry has not yet
announced a rate for is simply absent. Two figures are not copied from a cell: a Wholesale Bond's
`coupon.periodLength` is read off its dated periods (the most common span, rounded to whole
months), and its `issueDay` — stated in the file only for IZ — is otherwise the first Coupon
Period's start.

```json
{
  "family": "savings",
  "code": "EDO0734",
  "type": "EDO",
  "isin": "PL0000117081",
  "tenor": "P10Y",
  "saleWindow": { "from": "2024-07-01", "to": "2024-07-31" },
  "issuePrice": "100",
  "switchingPrice": "99.6",
  "totalSaleMlnPln": "753.8711",
  "switchedMlnPln": "40.9214",
  "coupon": {
    "schedule": "per-period",
    "periodLength": "P1Y",
    "rates": [
      { "period": 1, "rate": "0.068" },
      { "period": 2, "rate": "0.06" },
      { "period": 3, "rate": "0.051" }
    ],
    "margin": "0.02",
    "multiplier": null
  }
}
```

### Coverage

|                     | Types                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Savings, sold today | OTS, ROR, DOR, TOS, COI, EDO, ROS, ROD                                                                                           |
| Savings, retired    | DOS, TOZ, POS                                                                                                                    |
| Wholesale           | IZ                                                                                                                               |
| Not yet (TODO)      | KOS (rates written as prose), IR, RS, TZ, SP (1990s auction tables); OS, PS, DS, WS, WZ (the wholesale `Stałe`/`Zmienne` sheets) |

A sheet the parser has never seen makes the refresh of that file fail loudly rather than skip it.

## How it works

- **Download** — the gov.pl page is read, the link whose `<span class="extension">` carries the
  expected filename is followed, and the served `content-disposition` filename is checked.
- **Parse** — SheetJS (vendored in `lib/`), read by header text so a column moving is harmless
  and a column vanishing fails. Excel doubles become exact decimals; date serials become days.
- **Serve** — the newest file that parsed, held in memory. It is a proxy: whatever the Ministry's
  current file says is what you get, including its mistakes.
- **Refresh** — once at start, then every `REFRESH_EVERY` (default one day, jittered). To force
  one, restart. A download that fails or does not parse leaves the previous file in place. The
  files are kept under `DATA_DIR/latest` and `DATA_DIR/previous`; to see what changed between two
  refreshes, diff those.
- **Startup** — the files under `DATA_DIR/latest` are loaded, or on first boot the copies checked
  in under `fixtures/` (downloaded 2026-09-22), so the API is never blank even if gov.pl is down.

## Running

```sh
pnpm install
pnpm run check      # format, lint, typecheck, tests (against fixtures; no network)
pnpm run start      # http://localhost:3000/docs
```

| Variable        | Default |                                                 |
| --------------- | ------- | ----------------------------------------------- |
| `PORT`          | `3000`  |                                                 |
| `DATA_DIR`      | `data`  | the Ministry's files, `latest/` and `previous/` |
| `REFRESH_EVERY` | `1 day` | refresh interval                                |

### Docker

```sh
docker build -t polish-treasuries-api .
docker run -p 3000:3000 -v treasuries:/data polish-treasuries-api
```

The downloaded files live on the `/data` volume, so a restart serves them even while gov.pl is down.

## Data licence

The figures are public sector information published by the Ministry of Finance of the Republic of
Poland and are reproduced without change. This service adds no data of its own.
