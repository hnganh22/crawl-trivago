import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { TIMEOUT, RETRY, REQUEST_DELAY } from "../config/config.js";
import { sleep, jitter } from "../utils/sleep.js";

puppeteer.use(StealthPlugin());

export const CHROME_PATH = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const HEADLESS = process.env.PUPPETEER_HEADLESS === "1" ? "new" : false;
const GRAPHQL_BASE_URL = "https://www.trivago.com/graphql";

/*
 * Worker gọi hàm này 1 lần duy nhất để sinh session:
 * - Navigate tới Trivago homepage
 * - Đợi JS sensor Akamai chạy xong
 * - Extract cookie + x-trv-* headers từ cookie jar và window globals
 *
 * Trả về object runtimeHeaders để dùng cho các sendGraphQL() sau.
 */
export async function bootstrapPage(page) {
    await page.setViewport({ width: 1280, height: 800 });
    try {
        await page.goto("https://www.trivago.com/vi/", {
            waitUntil: "networkidle2",
            timeout: TIMEOUT,
        });
    } catch (e) {
        console.log("[Trivago] Navigation timeout, tiếp tục với page hiện tại");
    }

    await page
        .waitForFunction(
            () => typeof window.__TRV_CONFIG__ === "object" && window.__TRV_CONFIG__ !== null,
            { timeout: TIMEOUT },
        )
        .catch(() => console.log("[Trivago] __TRV_CONFIG__ chưa sẵn sàng, tiếp tục"));

    await sleep(jitter(3000, 0.5));

    const cookies = await page.cookies();
    const edgeTid = cookies.find((c) => c.name === "edge_tid")?.value ?? "";

    const windowGlobals = await page.evaluate(() => {
        const out = {};
        for (const key of [
            "x-trv-connection-id",
            "x-trv-cst",
            "x-trv-sequence-id",
            "x-trv-poll-id",
            "apollographql-client-version",
        ]) {
            const candidates = [
                window[key],
                window.__TRV_CONFIG__?.[key],
                window.__INITIAL_STATE__?.config?.[key],
            ];
            for (const v of candidates) {
                if (typeof v === "string" && v.length > 0) {
                    out[key] = v;
                    break;
                }
            }
        }
        return out;
    });

    const runtimeHeaders = {
        cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
        "x-trv-tid": edgeTid,
        ...windowGlobals,
    };

    console.log(
        "[bootstrapPage] runtimeHeaders:",
        JSON.stringify(runtimeHeaders, null, 2),
    );

    return runtimeHeaders;
}

/*
 * Bắn GraphQL qua page context của Chrome thật.
 * Caller quản lý page + runtimeHeaders lifecycle.
 */
export async function sendGraphQL(page, runtimeHeaders, payload, extraHeaders) {
    const operationName = payload?.operationName ?? "accommodationSearchQuery";
    const url = `${GRAPHQL_BASE_URL}?${operationName}`;

    const headers = {
        "Content-Type": "application/json",
        Accept: "application/graphql-response+json, application/json",
        "apollographql-client-name": "hs-web-app",
        "x-trv-app-id": "HS_WEB_APP_WARP",
        ...runtimeHeaders,
        ...extraHeaders,
    };

    for (let attempt = 1; attempt <= RETRY; attempt++) {
        try {
            await sleep(jitter(REQUEST_DELAY));

            const { Referer, ...fetchHeaders } = headers;

            const result = await page.evaluate(
                async ({ url, payload, fetchHeaders, referrer }) => {
                    const res = await fetch(url, {
                        method: "POST",
                        credentials: "include",
                        headers: fetchHeaders,
                        ...(referrer ? { referrer } : {}),
                        body: JSON.stringify(payload),
                    });

                    const status = res.status;
                    const text = await res.text();

                    let json = null;
                    try { json = JSON.parse(text); } catch {}

                    return { status, text, json };
                },
                { url, payload, fetchHeaders, referrer: Referer ?? null },
                { timeout: TIMEOUT },
            );

            const { status, text, json } = result;

            if (status === 401) {
                const err = new Error(`HTTP 401: ${text.slice(0, 200)}`);
                err.code = "AUTH_REQUIRED";
                throw err;
            }
            if (status === 403) {
                const err = new Error(`HTTP 403: ${text.slice(0, 500)}`);
                err.code = "BLOCKED";
                throw err;
            }
            if (status >= 400) throw new Error(`HTTP ${status}: ${text.slice(0, 200)}`);
            if (json?.errors?.length) throw new Error("GraphQL Error");

            return json?.data ?? null;
        } catch (error) {
            console.log(`[Worker - GraphQL] Lỗi lần ${attempt}/${RETRY}: ${error.message}`);
            if (attempt === RETRY) throw error;
            await sleep(jitter(1000 * attempt));
        }
    }
}