require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "trivago",
  user: process.env.DB_USER || "postgres",
  password: String(process.env.DB_PASSWORD || "postgres"),
});

async function getUrls(limit = 10) {
  const res = await pool.query(
    "SELECT id, destination, url, checkin_date::text, checkout_date::text, stay_nights, occupancy_adults FROM trivago_urls WHERE crawled_at IS NULL ORDER BY id LIMIT $1",
    [limit],
  );
  return res.rows;
}

async function saveHotelResults(task, hotels) {
  if (!hotels || hotels.length === 0) return;

  const insert = `
        INSERT INTO hotels_2 (
            url_id, hotel_id, ota_id,
            hotel_name, star_rating, accommodation_type,
            rating_value, rating_text, review_count, distance_label,
            cheapest_ota, cheapest_price, deals
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT DO NOTHING `;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of hotels) {
      await client.query(insert, [
        task.id,
        item.hotelId ?? null,
        item.otaId ?? null,
        item.name,
        item.star ??  null,
        item.accomodationType ?? null,
        item.ratingValue ?? null,
        item.ratingText ?? null,
        item.reviewCount  ?? null,
        item.distanceLabel ?? null ,
        item.cheapestOta ?? null,
        item.cheapestPrice,
        JSON.stringify(item.deals || []),
      ]);
    }
    await client.query(
      "UPDATE trivago_urls SET crawled_at = now() WHERE id = $1",
      [task.id],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function closePool() {
  await pool.end();
}
module.exports = {
  getUrls,
  saveHotelResults,
  closePool,
};
