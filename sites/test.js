import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

import crawler from "../src/crawler.js";
import parser from "../src/parser.js";
import { createDateRange } from "../utils/date.js";
import { closePool } from "../services/hotelService.js";
import { reset as resetBreaker } from "../utils/circuitBreaker.js";
import {
    bootstrapPage,
    CHROME_PATH,
    HEADLESS,
} from "../services/trivagoService.js";

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
}

async function shutdownBrowser() {
    if (browser) {
        await browser.close().catch(() => {});
    }

    browser = null;
    page = null;
    runtimeHeaders = {};
}

async function main() {
    resetBreaker();

    const stays = 1;

    const { checkin, checkout } = createDateRange(1, stays);

    const searchParams = {
        destination: "Ha Noi",
        destinationId: "200-68088",
        checkin,
        checkout,
        stays,
        adults: 2,
    };

    console.log("=================================");
    console.log("TRIVAGO TEST");
    console.log("=================================");

    console.log(searchParams);

    try {
        await startSession();

        console.log("\n[1] Starting crawler...");

        const response = await crawler.crawl(page, runtimeHeaders, searchParams);

        if (!response) {
            console.log("[2] Không nhận được response");
            return;
        }

        console.log("[2] Crawl thành công");

        console.log("\n[3] Parsing...");

        const hotels = parser.parse(response, searchParams);

        console.log(`[4] Parsed ${hotels.length} hotels`);

        console.log("\n[5] Inserting to Postgres...");
        console.log("[5] Skipped (smoke test only)");

        console.log("\nFirst hotel:");

        console.dir(hotels[0], {
            depth: null,
        });

        console.log("\n=================================");
        console.log("TEST DONE");
        console.log("=================================");
    } finally {
        await shutdownBrowser();
    }
}

main()
    .then(async () => {
        await closePool();
    })
    .catch(async (error) => {
        console.error("\nTEST FAILED");
        console.error(error);
        await closePool().catch(() => {});
        process.exit(1);
    });