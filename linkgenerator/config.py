import argparse
import csv
import os
import sys
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote


ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


DESTINATIONS = [
    {"key": "Ha Noi",       "city": "Hà Nội",       "country": "Việt Nam",        "city_slug": "hà-nội",       "country_slug": "việt-nam",                            "location_id": "200-68088", "include_country": True},
    {"key": "Da Nang",      "city": "Đà Nẵng",      "country": "Việt Nam",        "city_slug": "đà-nẵng",      "country_slug": "việt-nam",                            "location_id": "200-68104", "include_country": True},
    {"key": "Bangkok",      "city": "Bangkok",      "country": "Thái Lan",       "city_slug": "bangkok",      "country_slug": "thái-lan",                            "location_id": "200-15893", "include_country": True},
    {"key": "Seoul",        "city": "Seoul",        "country": "Hàn Quốc",       "city_slug": "seoul",        "country_slug": "hàn-quốc",                            "location_id": "200-81393", "include_country": True},
    {"key": "London",       "city": "London",       "country": "Vương Quốc Anh", "city_slug": "london",       "country_slug": "vương-quốc-anh",                      "location_id": "200-17399", "include_country": True},
    {"key": "Bali",         "city": "Bali",         "country": "Indonesia",      "city_slug": "bali",         "country_slug": "indonesia",                            "location_id": "200-72435", "include_country": True},
    {"key": "Kuala Lumpur", "city": "Kuala Lumpur", "country": "Malaysia",       "city_slug": "kuala-lumpur", "country_slug": "malaysia",                             "location_id": "200-56340", "include_country": True},
    {"key": "New York",     "city": "New York",     "country": "Hoa Kỳ",         "city_slug": "new-york",     "country_slug": "hoa-kỳ",                              "location_id": "200-14734", "include_country": False},
    {"key": "Dubai",        "city": "Dubai",        "country": "Các Tiểu Vương Quốc Ả Rập Thống Nhất", "city_slug": "dubai", "country_slug": "các-tiểu-vương-quốc-ả-rập-thống-nhất", "location_id": "200-15075", "include_country": True},
    {"key": "Singapore",    "city": "Singapore",    "country": "Singapore",      "city_slug": "singapore",    "country_slug": "singapore",                            "location_id": "200-25025", "include_country": False},
]

CHECKIN_OFFSETS = [1, 7, 30, 90]
STAY_NIGHTS = [1, 4]
ADULTS = [1, 2]
ROOMS = 1
DRS_PARAM = os.environ.get("TRV_DRS_PARAM", "drs-40")
DOMAIN = "www.trivago.vn"
LOCALE = "vi"
PATH = "srl"
VI_PREFIX = "khách-sạn"


def slugify(d: dict) -> str:
    parts = [VI_PREFIX, d["city_slug"]]
    if d.get("include_country") and d.get("country_slug"):
        parts.append(d["country_slug"])
    return quote("-".join(parts), safe="_")


def build_url(d: dict, checkin: date, checkout: date, adults: int) -> str:
    search = f"{d['location_id']};dr-{checkin:%Y%m%d}-{checkout:%Y%m%d};{DRS_PARAM};rc-{ROOMS}-{adults}"
    return f"https://{DOMAIN}/{LOCALE}/{PATH}/{slugify(d)}?search={search}"


def generate(run_date: date) -> list[dict]:
    rows = []
    for d in DESTINATIONS:
        for offset in CHECKIN_OFFSETS:
            checkin = run_date + timedelta(days=offset)
            for nights in STAY_NIGHTS:
                checkout = checkin + timedelta(days=nights)
                for adults in ADULTS:
                    rows.append({
                        "destination": d["key"],
                        "destination_display": d["city"],
                        "country": d["country"],
                        "location_id": d["location_id"],
                        "checkin_offset": offset,
                        "checkin_date": checkin.isoformat(),
                        "checkout_date": checkout.isoformat(),
                        "stay_nights": nights,
                        "occupancy_adults": adults,
                        "url": build_url(d, checkin, checkout, adults),
                        "run_date": run_date.isoformat(),
                    })
    return rows


def save_csv(rows: list[dict], path: str) -> None:
    if not rows:
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)


PG_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": int(os.environ.get("DB_PORT", 5432)),
    "dbname": os.environ.get("DB_NAME", "trivago"),
    "user": os.environ.get("DB_USER", "postgres"),
    "password": os.environ.get("DB_PASSWORD", ""),
}

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS trivago_urls (
    id                BIGSERIAL PRIMARY KEY,
    destination       TEXT NOT NULL,
    location_id       TEXT NOT NULL,
    checkin_offset    INT NOT NULL,
    checkin_date      DATE NOT NULL,
    checkout_date     DATE NOT NULL,
    stay_nights       INT NOT NULL,
    occupancy_adults  INT NOT NULL,
    url               TEXT NOT NULL,
    run_date          DATE NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (destination, checkin_date, stay_nights, occupancy_adults, run_date)
);
"""

UPSERT_SQL = """
INSERT INTO trivago_urls
    (destination, location_id, checkin_offset, checkin_date, checkout_date,
     stay_nights, occupancy_adults, url, run_date)
VALUES
    (%(destination)s, %(location_id)s, %(checkin_offset)s, %(checkin_date)s, %(checkout_date)s,
     %(stay_nights)s, %(occupancy_adults)s, %(url)s, %(run_date)s)
ON CONFLICT (destination, checkin_date, stay_nights, occupancy_adults, run_date)
DO UPDATE SET url = EXCLUDED.url,
              created_at = now();
"""


def save_postgres(rows: list[dict]) -> int:
    import psycopg2

    with psycopg2.connect(**PG_CONFIG) as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_TABLE_SQL)
            cur.executemany(UPSERT_SQL, rows)
        conn.commit()
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description="Trivago link generator")
    parser.add_argument("--date", help="Run date (YYYY-MM-DD). Default: today.")
    parser.add_argument("--csv", default="trivago_urls.csv", help="CSV output path.")
    parser.add_argument("--no-csv", action="store_true", help="Skip CSV output.")
    parser.add_argument("--no-pg", action="store_true", help="Skip Postgres output.")
    parser.add_argument("--sample", type=int, default=0, help="Print N sample URLs.")
    args = parser.parse_args()

    try:
        run_date = date.fromisoformat(args.date) if args.date else date.today()
    except ValueError:
        print(f"[linkgenerator] --date không hợp lệ: {args.date}", file=sys.stderr)
        sys.exit(2)

    rows = generate(run_date)
    print(f"[linkgenerator] Run date: {run_date}")
    print(f"[linkgenerator] Generated {len(rows)} URLs")

    if args.sample:
        print(f"\n{args.sample} URL mẫu:")
        for r in rows[:args.sample]:
            print(f"  - [{r['destination']}] {r['url']}")

    if not args.no_csv:
        save_csv(rows, args.csv)
        print(f"[linkgenerator] Saved CSV: {Path(args.csv).resolve()}")

    if not args.no_pg:
        n = save_postgres(rows)
        print(f"[linkgenerator] Upserted {n} rows to Postgres.")

    print("[linkgenerator] Done.")


if __name__ == "__main__":
    main()
