import { pool } from "../database/postgre.js";

const HOTEL_COLUMNS = [
  "source",
  "destination",
  "location_id",
  "checkin_date",
  "checkout_date",
  "stay_nights",
  "adults",
  "hotel_id",
  "hotel_name",
  "accommodation_type",
  "hotel_url",
  "price",
  "room_name",
  "currency",
  "star_rating",
  "review_score",
  "review_count",
  "review_label",
  "address",
  "latitude",
  "longitude",
  "distance_reference",
  "is_popular_highlights",
  "thumbnail_url",
  "amenities",
  "run_date",
];

const UPDATE_COLUMNS = [
  "hotel_name",
  "accommodation_type",
  "hotel_url",
  "price",
  "currency",
  "star_rating",
  "review_score",
  "review_count",
  "review_label",
  "address",
  "latitude",
  "longitude",
  "distance_reference",
  "is_popular_highlights",
  "thumbnail_url",
  "amenities",
];

function mapHotelToRow(hotel, runDate) {
  return [
    hotel.source ?? null,
    hotel.destination ?? null,
    hotel.location_id ?? null,
    hotel.checkin ?? null,
    hotel.checkout ?? null,
    hotel.stays ?? null,
    hotel.adults ?? null,
    hotel.hotel_id ?? null,
    hotel.hotel_name ?? null,
    hotel.accommodation_type ?? null,
    hotel.hotel_url ?? null,
    hotel.price ?? null,
    hotel.room_name ?? null,
    hotel.currency ?? "VND",
    hotel.star_rating ?? null,
    hotel.review_score ?? null,
    hotel.review_count ?? null,
    hotel.review_label ?? null,
    hotel.address ?? null,
    hotel.latitude ?? null,
    hotel.longitude ?? null,
    hotel.distance_reference ?? null,
    hotel.is_popular_highlights ?? false,
    hotel.thumbnail_url ?? null,
    hotel.amenities ? JSON.stringify(hotel.amenities) : null,
    runDate,
  ];
}
export async function insertHotels(hotels, runDate) {
  if (!hotels || hotels.length === 0) {
    return 0;
  }

  runDate = runDate || new Date().toISOString().slice(0, 10);

  const placeholders = hotels
    .map((_, i) => {
      const offset = i * HOTEL_COLUMNS.length;
      return `(${HOTEL_COLUMNS.map((_, j) => `$${offset + j + 1}`).join(", ")})`;
    })
    .join(", ");

  const values = hotels.flatMap((hotel) => mapHotelToRow(hotel, runDate));

  const updateSet = UPDATE_COLUMNS.map(
    (column) => `${column} = EXCLUDED.${column}`,
  ).join(", ");

  const sql = `
    INSERT INTO hotels (
      ${HOTEL_COLUMNS.join(", ")}
    )
    VALUES ${placeholders}
    ON CONFLICT (
      source,
      hotel_id,
      room_name,
      run_date
    )
    DO UPDATE SET
      ${updateSet},
      crawled_at = now()
  `;

  const client = await pool.connect();
  try {
    const result = await client.query(sql, values);
    console.log(`[HotelService] ${result.rowCount} hotels inserted/updated`);
    return result.rowCount;
  } catch (error) {
    console.error(`[HotelService] Insert failed: ${error.message}`);
    throw error;
  } finally {
    await client.release();
  }
}

export async function closePool() {
  await pool.end();
}

export default {
  insertHotels,
  closePool,
};