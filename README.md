# polish-treasuries-api

The Ministry of Finance's bond spreadsheets as an API: Treasury bond terms and the first-published
monthly reference index (_WRk_ / _Wn_), as the Ministry published them. Nothing is calculated;
figures can only be re-expressed (decimals as strings, millions of PLN as PLN). The terms used here
(Series, Coupon Period, Reference Index…) are defined in [`CONTEXT.md`](CONTEXT.md), along with
the Polish they translate.

Sources: `kalkulatorodsetek.xlsm` ([kalkulatory2](https://www.gov.pl/web/finanse/kalkulatory2)) and
`Dane_dotyczace_obligacji_detalicznych.xls`
([obligacje-detaliczne1](https://www.gov.pl/web/finanse/obligacje-detaliczne1)).

## Endpoints

```
GET /v1/inflation  /v1/inflation?period=2026  /v1/inflation?period=2026-02
GET /v1/bonds  /v1/bonds?series=EDO0734  /v1/bonds?prefix=EDO  /v1/bonds?family=savings
GET /v1/bonds?isin=PL0000117081
GET /v1/health
GET /openapi.json  /docs
```

Every read returns a list, `[]` when nothing matches; only a malformed parameter is an error (400).
Filters on `/bonds` combine. Append `.csv` or `.tsv` to the path to get the same data as a table:
`/v1/bonds.csv?prefix=EDO`.

Decimals are strings, amounts are PLN, days are `YYYY-MM-DD` and tenors are ISO 8601 (`P10Y`). A
rate the Ministry has not announced yet is left out. Two wholesale fields are read off other cells
rather than copied from their own: `coupon.periodLength` (the most common period span) and
`issueDate` (the first period's first day; the file only states it for IZ).

## Coverage

- **Savings:** OTS, ROR, DOR, TOS, COI, EDO, ROS, ROD, DOS, TOZ, POS
- **Wholesale:** IZ; OS, PS, DS, WS, AS, TK, CK, PK, DK, SP (fixed); TZ, WZ, DZ, PP, NZ (floating)
- **Not parsed:** savings KOS, IR, RS, TZ, SP; the 1990s `PPT` rows; `WVH`

A refresh fails if a sheet appears, or if a sheet or column that is read disappears or holds
something unexpected. When a refresh fails, the previous file is still served. New columns and
the skipped sheets are not checked.

## Running

```sh
pnpm install && pnpm run check && pnpm run start   # http://localhost:3000/docs
docker build -t polish-treasuries-api . && docker run -p 3000:3000 -v treasuries:/data polish-treasuries-api
```

`PORT` (`3000`), `DATA_DIR` (`data`), `REFRESH_EVERY` (`1 day`). Files are refreshed at start and
then on that interval, kept in `DATA_DIR/latest` and `previous`. On first boot the service loads
`fixtures/`.

Behind a reverse proxy on a subpath, set `BASE_PATH` (e.g. `/polish-treasuries-api`) and have the
proxy strip the prefix. `BASE_PATH` goes into the OpenAPI document's `servers`, so `/docs`
sends its requests under the prefix, and into the redirect from `/` to `/docs`.

Code: [ISC](LICENSE). The data is public sector information from the Ministry of Finance,
reproduced unchanged.
