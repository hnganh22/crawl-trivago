import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

import fs from "fs/promises";

import crawler from "../src/crawler.js";
import parser from "../src/parser.js";
import { DESTINATION } from "../config/config.js";
import {
    CHECKIN_OFFSETS,
    STAYS,
    ADULTS,
    BATCH_SIZE,
} from "../config/config.js";
import { createDateRange } from "../utils/date.js";
import { sleep, jitter } from "../utils/sleep.js";
import { insertHotels, closePool } from "../services/hotelService.js";
import { BREAKER_MESSAGE } from "../utils/circuitBreaker.js";
import {
    bootstrapPage,
    CHROME_PATH,
    HEADLESS,
} from "../services/trivagoService.js";

const SLEEP_BETWEEN_SEARCHES = 2000;
const MAX_CONSECUTIVE_BLOCKS = 3;
const MAX_COOLDOWNS = 3;
const COOLDOWN_MS = 5 * 60 * 1000;
const INSERT_RETRY = 3;
const DEADLETTER_PATH = "deadletter.jsonl";

let browser = null;
let page = null;
let runtimeHeaders = {};

async function startSession() {
    if (browser) return;

    browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: HEADLESS,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--window-size=1280,800",
            "--lang=vi-VN,vi",
        ],
        ignoreDefaultArgs: ["--enable-automation"],
    });

    page = await browser.newPage();

    runtimeHeaders = await bootstrapPage(page);

    console.log(
        `[Main] Session ready — cookie ${runtimeHeaders.cookie?.length ?? 0} chars, tid=${runtimeHeaders["x-trv-tid"]?.slice(0, 8) ?? "?"}`,
    );
}

async function shutdownBrowser() {
    if (browser) {
        await browser.close().catch(() => {});
    }

    browser = null;
    page = null;
    runtimeHeaders = {};
}

async function insertHotelsWithRetry(hotels, search) {
    let lastErr = null;
    for (let attempt = 1; attempt <= INSERT_RETRY; attempt++) {
        try {
            await insertHotels(hotels);
            return;
        } catch (err) {
            lastErr = err;
            console.error(
                `[Trivago] insertHotels lần ${attempt}/${INSERT_RETRY} thất bại: ${err.message}`,
            );
            if (attempt < INSERT_RETRY) {
                await sleep(jitter(1000 * attempt));
            }
        }
    }
    await writeDeadLetter(search, hotels, lastErr);
}

async function writeDeadLetter(search, hotels, error) {
    const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        search,
        hotel_count: hotels.length,
        error: error.message,
    }) + "\n";
    try {
        await fs.appendFile(DEADLETTER_PATH, line, "utf-8");
        console.error(
            `[Trivago] Đã ghi ${hotels.length} hotels vào ${DEADLETTER_PATH}`,
        );
    } catch (err) {
        console.error(`[Trivago] Ghi dead-letter thất bại: ${err.message}`);
    }
}

function createSearches() {
    const searches = [];

    for (const [name, id] of Object.entries(DESTINATION)) {
        for (const checkinOffset of CHECKIN_OFFSETS) {
            for (const stays of STAYS) {
                for (const adults of ADULTS) {
                    const { checkin, checkout } = createDateRange(
                        checkinOffset,
                        stays,
                    );

                    searches.push({
                        destination: name,
                        destinationId: id,
                        checkin,
                        checkout,
                        stays,
                        adults,
                    });
                }
            }
        }
    }

    return searches;
}

function shuffle(arr) {
    const out = [...arr];

    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }

    return out;
}

function pickBatch(searches) {
    if (!BATCH_SIZE || BATCH_SIZE >= searches.length) {
        return searches;
    }

    return shuffle(searches).slice(0, BATCH_SIZE);
}

export async function crawlAll() {
    await startSession();

    try {
        const all = createSearches();

        const searches = pickBatch(all);

        console.log(
            `[Trivago] Tổng số search: ${searches.length}` +
                (BATCH_SIZE ? ` (BATCH_SIZE=${BATCH_SIZE})` : ""),
        );

        const allHotels = [];

        let consecutiveBlocks = 0;
        let totalCooldowns = 0;

        for (let i = 0; i < searches.length; i++) {
            const search = searches[i];

            console.log(
                `\n[Trivago] Search ${i + 1}/${searches.length}`,
            );

            console.log(
                `${search.destination} | ` +
                    `${search.checkin} → ${search.checkout} | ` +
                    `${search.adults} adults`,
            );

            try {
                const response = await crawler.crawl(
                    page,
                    runtimeHeaders,
                    search,
                );

                if (!response) {
                    console.log("[Trivago] Không có response");
                    continue;
                }

                consecutiveBlocks = 0;

                const hotels = parser.parse(response, search);

                console.log(
                    `[Trivago] Parse được ${hotels.length} hotels`,
                );

                if (hotels.length > 0) {
                    await insertHotelsWithRetry(hotels, search);
                }

                allHotels.push(...hotels);
            } catch (error) {
                const isBlocked =
                    /403|Access Denied/i.test(error.message) ||
                    error.message === BREAKER_MESSAGE;

                if (isBlocked) {
                    consecutiveBlocks++;

                    console.error(
                        `[Trivago] Bị chặn lần ${consecutiveBlocks} liên tiếp`,
                    );

                    if (consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS) {
                        totalCooldowns++;

                        if (totalCooldowns > MAX_COOLDOWNS) {
                            throw new Error(
                                `Đã cooldown ${MAX_COOLDOWNS} lần, vẫn bị chặn — dừng crawl.`,
                            );
                        }

                        console.error(
                            `[Trivago] Tạm dừng ${COOLDOWN_MS / 1000}s để hạ nhiệt (${totalCooldowns}/${MAX_COOLDOWNS})...`,
                        );

                        await sleep(COOLDOWN_MS);

                        consecutiveBlocks = 0;
                    }
                } else {
                    console.error(
                        `[Trivago] Search failed:`,
                        error.message,
                    );
                }
            }

            if (i < searches.length - 1) {
                await sleep(jitter(SLEEP_BETWEEN_SEARCHES));
            }
        }

        console.log(
            `\n[Trivago] Total hotel records: ${allHotels.length}`,
        );

        return allHotels;
    } finally {
        await shutdownBrowser();
        await closePool();
    }
}

async function cleanupAndExit(code = 0) {
    console.log("\n[Main] Đang dọn dẹp tài nguyên...");
    try {
        await shutdownBrowser();
        await closePool();
        console.log("[Main] Dọn dẹp xong. Thoát.");
        process.exit(code);
    } catch (err) {
        console.error("[Main] Lỗi khi dọn dẹp:", err);
        process.exit(1);
    }
}

process.on("SIGINT", () => cleanupAndExit(0));
process.on("SIGTERM", () => cleanupAndExit(0));

process.on("uncaughtException", async (err) => {
    console.error("[Main] Lỗi nghiêm trọng:", err);
    await cleanupAndExit(1);
});

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
    crawlAll()
        .then(async () => {
            await cleanupAndExit(0);
        })
        .catch(async (error) => {
            console.error("[Trivago] FATAL:", error);
            await cleanupAndExit(1);
        });
}

export default {
    crawlAll,
};