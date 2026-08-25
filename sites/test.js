import crawler from "../src/crawler.js";
import parser from "../src/parser.js";
import { createDateRange } from "../utils/date.js";
import { closePool } from "../services/hotelService.js";
import { reset as resetBreaker } from "../utils/circuitBreaker.js";

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
    console.log("TRIVAGO TEST (AXIOS)");
    console.log("=================================");
    console.log(searchParams);

    console.log("\n[1] Starting crawler...");
    const response = await crawler.crawl(searchParams);

    if (!response) {
        console.log("[2] Không nhận được response");
        return;
    }

    console.log("[2] Crawl done ");

    console.log("\n[3] Parsing...");
    const hotels = parser.parse(response, searchParams);

    console.log(`[4] Parsed ${hotels.length} hotels`);

    console.log("\n[5] Inserting to Postgres...");
    console.log("[5] Skipped (smoke test only)");

    if (hotels.length > 0) {
        console.log("\nFirst hotel:");
        console.dir(hotels[0], { depth: null });
    } else {
        console.log("\nKhông tìm thấy dữ liệu khách sạn.");
    }

    console.log("\n=================================");
    console.log("TEST DONE");
    console.log("=================================");
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