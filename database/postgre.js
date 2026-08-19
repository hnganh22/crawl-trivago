import pg from "pg";
const {Pool} =  pg;

export const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "trivago",
  user: "postgres",
  password: "123456",
});