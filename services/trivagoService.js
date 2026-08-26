import "dotenv/config";
import axios from "axios";
import { TIMEOUT, RETRY, REQUEST_DELAY } from "../config/config.js";
import { sleep, jitter } from "../utils/sleep.js";
const GRAPHQL_BASE_URL = "https://www.trivago.com/graphql";

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/graphql-response+json, application/json",
  "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
  "Origin": "https://www.trivago.com",
  "User-Agent":
    process.env.USER_AGENT ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "apollographql-client-name":
    process.env.TRV_APOLLO_CLIENT_NAME ?? "hs-web-app",
    "apollographql-client-version":
    process.env.TRV_APOLLO_CLIENT_VERSION ?? "3bbdda8f",
    "x-trv-app-id":
   process.env.TRV_APP_ID ?? "HS_WEB_APP_WARP",
 };

export async function sendGraphQL(payload, extraHeaders = {}) {
  console.log("DEBUG");
  const operationName = payload?.operationName ?? "accommodationSearchQuery";
  const url = `${GRAPHQL_BASE_URL}?${operationName}`;

  const headers = Object.fromEntries(
    Object.entries({
      ...DEFAULT_HEADERS,
      ...(process.env.TRV_COOKIE ? { cookie: process.env.TRV_COOKIE } : {}),
      ...(process.env.TRV_TID ? { "x-trv-tid": process.env.TRV_TID } : {}),
      ...extraHeaders,
    }).filter(([, v]) => v !== "" && v !== undefined && v !== null)
  );

  for (let attempt = 1; attempt <= RETRY; attempt++) {
    try {
      if (REQUEST_DELAY) {
        await sleep(jitter ? jitter(REQUEST_DELAY) : REQUEST_DELAY);
      } // <-- Đã thêm dấu đóng ngoặc nhọn bị thiếu ở đây

      const response = await axios.post(url, payload, {
        headers,
        timeout: TIMEOUT || 30000,
        validateStatus: () => true,
      });

      const { status, data } = response;

      if (status === 401) {
        const err = new Error("HTTP 401: Unauthorized");
        err.code = "AUTH_REQUIRED";
        throw err;
      }
      if (status === 403) {
        const err = new Error("HTTP 403: Blocked by WAF");
        err.code = "BLOCKED";
        throw err;
      }
      if (status >= 400) {
        const preview =
          typeof data === "string"
            ? data.slice(0, 200)
            : JSON.stringify(data).slice(0, 200);
        throw new Error(`HTTP ${status}: ${preview}`);
      }
      if (data?.errors?.length) {
        const msg = data.errors.map((e) => e.message).join("; ");
        throw new Error(`GraphQL Error: ${msg}`);
      }

      return data?.data ?? null;
    } catch (error) {
      console.warn(
        `[Axios - GraphQL] Lỗi lần ${attempt}/${RETRY}: ${error.message}`
      );

      if (attempt === RETRY) {
        throw error;
      }

      const backoff = 1000 * attempt;
      await sleep(jitter ? jitter(backoff) : backoff);
    }
  }
}