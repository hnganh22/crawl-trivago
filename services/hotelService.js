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
  "description",
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
   "deal_id",
  "run_date",
];

const UPDATE_COLUMNS = [
  "hotel_name",
  "accommodation_type",
  "description",
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

function mapHotelToRow(deal, runDate) {
  return [
    deal.advertiserDetails?.translatedName?.value ?? deal.source ?? null,
    deal.destination ?? null,
    deal.location_id ?? null,
    deal.checkin_date ?? deal.checkin ?? null,
    deal.checkout_date ?? deal.checkout ?? null,
    deal.stay_nights ?? deal.stays ?? null,
    deal.adults ?? null,
    deal.accommodationDetails?.nsid?.id ?? deal.hotel_id ?? null,
    deal.hotel_name ?? null,
    deal.accommodation_type ?? null,
    deal.clickoutUrl ?? deal.hotel_url ?? null,
    deal.pricePerNight?.amount ?? deal.allInPricePerNight?.amount ?? deal.price ?? null,
    deal.description ?? "",
    deal.currency ?? "VND",
    deal.star_rating ?? null,
    deal.review_score ?? null,
    deal.review_count ?? null,
    deal.review_label ?? null,
    deal.address ?? null,
    deal.latitude ?? null,
    deal.longitude ?? null,
    deal.distance_reference ?? null,
    deal.is_popular_highlights ?? false,
    deal.thumbnail_url ?? null,
    deal.amenities ? JSON.stringify(deal.amenities) : null,
    deal.id ?? null,
    runDate,
  ];
}

export async function insertHotels(hotels, runDate) {
  if (!hotels || hotels.length === 0) {
    return 0;
  }

  runDate = runDate || new Date().toISOString().slice(0, 10);

  // 1. Lọc trùng theo các biến định danh rõ ràng
  const seenKeys = new Set();
  
  const cleanHotels = hotels.filter((hotel) => {
    const source = hotel.source || hotel.advertiserDetails?.translatedName?.value || "trivago";
    const hotelId = hotel.hotel_id || hotel.hotelId || hotel.accommodationDetails?.nsid?.id;
    const description = hotel.description ?? "";

    if (!source || !hotelId) {
      return false;
    }

    const uniqueKey = `${source}_${hotelId}_${description}_${runDate}`;
    if (seenKeys.has(uniqueKey)) {
      return false;
    }

    seenKeys.add(uniqueKey);
    return true;
  });

  if (cleanHotels.length === 0) {
    return 0;
  }

  // 2. Chuyển mảng đã lọc sạch thành mảng values cho query SQL
  const values = cleanHotels.flatMap((hotel) => mapHotelToRow(hotel, runDate));

  const placeholders = cleanHotels
    .map((_, i) => {
      const offset = i * HOTEL_COLUMNS.length;
      return `(${HOTEL_COLUMNS.map((_, j) => `$${offset + j + 1}`).join(", ")})`;
    })
    .join(", ");

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
      deal_id,
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
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}

export default {
  insertHotels,
  closePool,
};