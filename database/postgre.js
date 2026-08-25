import "dotenv/config";
import pg from "pg";
const {Pool} =  pg;

function resolvePassword() {
  const raw = process.env.DB_PASSWORD;
  if (!raw) return "";
  return String(raw).trim().replace(/^["']|["']$/g, "");
}

export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "trivago",
  user: process.env.DB_USER || "postgres",
  password: resolvePassword(),
});