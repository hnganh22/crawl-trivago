import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import {
  TIMEOUT,
  RETRY,
  REQUEST_DELAY,
} from "../config/config.js";
import { sleep, jitter } from "../utils/sleep.js";
import {
  recordSuccess,
  recordForbidden,
  shouldTrip,
  BREAKER_MESSAGE,
} from "../utils/circuitBreaker.js";

puppeteer.use(StealthPlugin());

const CHROME_PATH =
    process.env.CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const GRAPHQL_BASE_URL = "https://www.trivago.com/graphql";

const HEADLESS =
    process.env.PUPPETEER_HEADLESS === "1"
        ? "new"
        : false;

let browser = null;
let page = null;
let bootstrapped = false;
let runtimeHeaders = {};

/*
 * Sau khi Trivago JS chạy xong, lấy các session-bound header
 * (x-trv-tid, x-trv-connection-id, x-trv-cst, x-trv-sequence-id)
 * từ cookie jar + window globals của page.
 *
 * Mỗi session Chrome tạo giá trị MỚI — không bao giờ dùng giá trị
 * hardcode hoặc từ .env cho các header này.
 */
async function captureRuntimeHeaders() {
    const cookies = await page.cookies();

    const edgeTid =
        cookies.find((c) => c.name === "edge_tid")?.value ?? "";

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

    runtimeHeaders = {
        cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
        "x-trv-tid": edgeTid,
        ...windowGlobals,
    };
}

async function bootstrap() {
    if (bootstrapped && page && !page.isClosed()) return;

    if (browser) {
        await browser.close().catch(() => {});
        browser = null;
        page = null;
    }

    browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: HEADLESS,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--lang=vi",
            "--window-size=1280,800",
        ],
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
        await page.goto("https://www.trivago.com/vi/", {
            waitUntil: "domcontentloaded",
            timeout: TIMEOUT,
        });
    } catch (e) {
        console.log(
            "[Trivago] Navigation timeout, tiếp tục với page hiện tại",
        );
    }

    await sleep(jitter(3000, 0.5));

    await captureRuntimeHeaders();

    console.log(
        `[Trivago] Bootstrap xong — ${runtimeHeaders.cookie?.length ?? 0} chars cookie, tid=${runtimeHeaders["x-trv-tid"]?.slice(0, 8) ?? "?"}`,
    );

    bootstrapped = true;
}

export async function shutdown() {
    if (browser) {
        await browser.close().catch(() => {});
        browser = null;
        page = null;
        bootstrapped = false;
        runtimeHeaders = {};
    }
}

export async function sendGraphQL(payload, extraHeaders) {
    await bootstrap();

    const operationName =
        payload?.operationName ?? "accommodationSearchQuery";

    const url = `${GRAPHQL_BASE_URL}?${operationName}`;

    const headers = {
        "Content-Type": "application/json",
        Accept:
            "application/graphql-response+json, application/json",
        "apollographql-client-name": "hs-web-app",
        "x-trv-app-id": "HS_WEB_APP_WARP",
        ...runtimeHeaders,
        ...extraHeaders,
    };

    for (let attempt = 1; attempt <= RETRY; attempt++) {
        try {
            await sleep(jitter(REQUEST_DELAY));

            if (!page || page.isClosed()) {
                bootstrapped = false;
                await bootstrap();
            }

            const { Referer, ...fetchHeaders } = headers;

            const result = await page.evaluate(
                async ({
                    url,
                    payload,
                    fetchHeaders,
                    referrer,
                }) => {
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
                    try {
                        json = JSON.parse(text);
                    } catch {}

                    return { status, text, json };
                },
                {
                    url,
                    payload,
                    fetchHeaders,
                    referrer: Referer ?? null,
                },
            );

            const { status, text, json } = result;

            if (status === 403) {
                recordForbidden();

                if (shouldTrip()) {
                    await shutdown();
                    throw new Error(BREAKER_MESSAGE);
                }

                throw new Error(
                    "Trivago blocked the request with HTTP 403",
                );
            }

            if (status >= 400 && status < 500) {
                throw new Error(
                    `HTTP ${status}: ${text.slice(0, 500)}`,
                );
            }

            if (status >= 500) {
                console.log(
                    `[Trivago] HTTP ${status}: ${text.slice(0, 500)}`,
                );

                throw new Error(`HTTP ${status}`);
            }

            if (json?.errors?.length) {
                const message = json.errors
                    .map((error) => error.message)
                    .join("; ");

                throw new Error(
                    `[Trivago] GraphQL error: ${message}`,
                );
            }

            recordSuccess();

            return json?.data ?? null;
        } catch (error) {
            console.log(
                `[Trivago] Attempt ${attempt}/${RETRY}: ${error.message}`,
            );

            if (error.message === BREAKER_MESSAGE) {
                throw error;
            }

            const statusMatch =
                error.message.match(/HTTP (\d+)/);
            const status = statusMatch
                ? parseInt(statusMatch[1])
                : null;

            const retryableStatus = [
                408, 429, 500, 502, 503, 504,
            ];

            const canRetry =
                status &&
                retryableStatus.includes(status);

            if (!canRetry) {
                throw error;
            }

            if (attempt === RETRY) {
                throw error;
            }

            await sleep(jitter(1000 * attempt));
        }
    }
}