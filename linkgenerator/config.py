import csv
import os
import re
from datetime import date, timedelta
from itertools import product
from pathlib import Path
from urllib.parse import quote


def _load_dotenv(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


_load_dotenv()


DESTINATION = {
    "Ha Noi":  {"city": "Hà Nội", "country": "Việt Nam", "location_id": "200-68088"},
    "Da Nang": {"city": "Đà Nẵng", "country": "Việt Nam", "location_id": "200-68104"},
    "Bangkok": {"city": "Bangkok", "country": "Thái Lan", "location_id": "200-15893"}, 
    "Seoul":  {"city": "Seoul", "country": "Hàn Quốc", "location_id": "200-81393"},    
    "London":  {"city": "London", "country": "Vương Quốc Anh", "location_id": "200-17399"},  
    "Bali":    {"city": "Bali", "country": "Indonesia", "location_id": "200-72435"},    
    "Kuala Lumpur":  {"city": "Kuala Lumpur", "country": "Malaysia", "location_id": "200-56340"},    
    "New York":  {"city": "New York", "country": "Hoa Kỳ", "location_id": "200-14734"},     
    "Dubai": {"city": "Dubai", "country": "Các Tiểu Vương Quốc Ả Rập Thống Nhất", "location_id":  "200-15075"},     
    "Singapore": {"city": "Singapore", "country": "Singapore", "location_id": "200-25025"}, 
}
 
CHECKIN_OFFSETS = [1, 7, 30, 90]   
STAY_NIGHTS     = [1, 4]           
OCCUPANCY       = [1, 2]           
ROOMS           = 1               
DRS_PARAM       = "drs-40"


DOMAIN   = "www.trivago.com"   
LOCALE   = "vi"                 
VI_PREFIX = "khách-sạn"         

BASE_URL = f"https://{DOMAIN}/{LOCALE}/srl/{{slug}}"

def slugify(entry: dict) -> str:
    city = re.sub(r"\s+", "-", entry["city"].strip().lower())
    country = re.sub(r"\s+", "-", entry["country"].strip().lower())
    slug = f"{VI_PREFIX}-{city}-{country}"
    return quote(slug, safe="_")

def build_url(entry_key: str, checkin: date, checkout: date, adults: int) -> str:

    entry = DESTINATION[entry_key]
    location_id = entry["location_id"]
    slug = slugify(entry)

    checkin_str = checkin.strftime("%Y%m%d")
    checkout_str = checkout.strftime("%Y%m%d")

    search_param = (
        f"{location_id};dr-{checkin_str}-{checkout_str};"
        f"{DRS_PARAM};rc-{ROOMS}-{adults}"
    )

    return f"{BASE_URL.format(slug=slug)}?search={search_param}"


def generate_urls(run_date: date = None) -> list[dict]:
    run_date = run_date or date.today()
    rows = []

    combos = product(
        DESTINATION.items(),
        CHECKIN_OFFSETS,
        STAY_NIGHTS,
        OCCUPANCY,
    )

    for (key, entry), offset, nights, adults in combos:
        checkin = run_date + timedelta(days=offset)
        checkout = checkin + timedelta(days=nights)

        rows.append({
            "destination": key,                    # "Ha Noi" – key ổn định cho DB
            "destination_display": entry["city"],  # "Hà Nội" – hiển thị
            "country": entry["country"],
            "location_id": entry["location_id"],
            "checkin_offset": offset,
            "checkin_date": checkin.isoformat(),
            "checkout_date": checkout.isoformat(),
            "stay_nights": nights,
            "occupancy_adults": adults,
            "url": build_url(key, checkin, checkout, adults),
            "run_date": run_date.isoformat(),
        })

    return rows


def save_csv(rows: list[dict], path: str = "trivago_urls.csv") -> None:
    fieldnames = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


PG_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": int(os.environ.get("DB_PORT", "5432")),
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
VALUES %s
ON CONFLICT (destination, checkin_date, stay_nights, occupancy_adults, run_date)
DO UPDATE SET url = EXCLUDED.url, created_at = now();
"""
 
 
def save_postgres(rows: list[dict], pg_config: dict = PG_CONFIG) -> None:
    import psycopg2
    from psycopg2.extras import execute_values
 
    values = [
        (
            r["destination"], r["location_id"], r["checkin_offset"],
            r["checkin_date"], r["checkout_date"], r["stay_nights"],
            r["occupancy_adults"], r["url"], r["run_date"],
        )
        for r in rows
    ]
 
    with psycopg2.connect(**pg_config) as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_TABLE_SQL)
            execute_values(cur, UPSERT_SQL, values)
        conn.commit()
 
 
if __name__ == "__main__":
    urls = generate_urls()
    n_dest, n_ci, n_stay, n_occ = len(DESTINATION), len(CHECKIN_OFFSETS), len(STAY_NIGHTS), len(OCCUPANCY)
    print(f"Da sinh {len(urls)} URL ({n_dest} destination x {n_ci} checkin x {n_stay} stay x {n_occ} occupancy).")
 
   
    out_path = Path("trivago_urls.csv")
    save_csv(urls, str(out_path))
    print(f"Da luu CSV: {out_path.resolve()}")
 
    try:
        save_postgres(urls)
        print(f"Da luu {len(urls)} dong vao bang 'trivago_urls' trong Postgres.")

    except Exception as e:
        print(f"Loi khi luu Postgres: {e}")
 
    print("\n5 URL dau tien:")
    for row in urls[:5]:
        print(" -", row["url"])
 