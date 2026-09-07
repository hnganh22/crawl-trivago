CREATE TABLE IF NOT EXISTS trivago_urls (
    id BIGSERIAL PRIMARY KEY,

    destination TEXT NOT NULL,
    location_id TEXT NOT NULL,

    checkin_offset INT NOT NULL,
    checkin_date DATE NOT NULL,
    checkout_date DATE NOT NULL,

    stay_nights INT NOT NULL,
    occupancy_adults INT NOT NULL,

    url TEXT NOT NULL,

    run_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (
        destination,
        checkin_date,
        stay_nights,
        occupancy_adults,
        run_date
    )
);


CREATE TABLE IF NOT EXISTS hotels (
    id BIGSERIAL PRIMARY KEY,

    source TEXT NOT NULL,

    destination TEXT NOT NULL,
    location_id TEXT NOT NULL,

    checkin_date DATE NOT NULL,
    checkout_date DATE NOT NULL,
    stay_nights INT NOT NULL,
    adults INT NOT NULL,

    hotel_id TEXT NOT NULL,
    hotel_name TEXT,
    accommodation_type TEXT,

    hotel_url TEXT,

    price NUMERIC,
    description TEXT NOT NULL DEFAULT '',
    currency TEXT DEFAULT 'VND',

    star_rating NUMERIC,
    review_score NUMERIC,
    review_count INT,
    review_label TEXT,

    address TEXT,
    latitude NUMERIC,
    longitude NUMERIC,

    distance_reference TEXT,

    is_popular_highlights BOOLEAN DEFAULT false,

    thumbnail_url TEXT,

    amenities JSONB,

    deal_id TEXT, 

    run_date DATE NOT NULL,
    crawled_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (
        source,
        hotel_id,
        deal_id,
        run_date
    )
);


CREATE INDEX IF NOT EXISTS idx_hotels_run_date
ON hotels (run_date);


CREATE INDEX IF NOT EXISTS idx_hotels_destination_checkin
ON hotels (destination, checkin_date);


CREATE INDEX IF NOT EXISTS idx_hotels_amenities
ON hotels USING GIN (amenities);

ALTER TABLE hotels ADD COLUMN deal_id TEXT;
ALTER TABLE hotels DROP CONSTRAINT hotels_source_hotel_id_description_run_date_key;
ALTER TABLE hotels ADD CONSTRAINT hotels_deal_unique 
    UNIQUE (source, hotel_id, deal_id, run_date);