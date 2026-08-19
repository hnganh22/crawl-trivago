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

const SLEEP_BETWEEN_SEARCHES = 2000;
const MAX_CONSECUTIVE_BLOCKS = 3;
const COOLDOWN_MS = 5 * 60 * 1000;

function createSearches() {
  const searches = [];

  for (const [name, id] of Object.entries(DESTINATION))  {
    for (const checkinOffset of CHECKIN_OFFSETS) {
      for (const stays of STAYS) {
        for (const adults of ADULTS) {
          const { checkin, checkout } = createDateRange(
            checkinOffset,
            stays
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
  const all = createSearches();

  const searches = pickBatch(all);

  console.log(
    `[Trivago] Tổng số search: ${searches.length}` +
      (BATCH_SIZE ? ` (BATCH_SIZE=${BATCH_SIZE})` : ""),
  );

  const allHotels = [];

  let consecutiveBlocks = 0;

  for (let i = 0; i < searches.length; i++) {
    const search = searches[i];

    console.log(
      `\n[Trivago] Search ${i + 1}/${searches.length}`
    );

    console.log(
      `${search.destination} | ` +
        `${search.checkin} → ${search.checkout} | ` +
        `${search.adults} adults`
    );

    try {
      const response = await crawler.crawl(search);

      if (!response) {
        console.log("[Trivago] Không có response");
        continue;
      }

      consecutiveBlocks = 0;

      const hotels = parser.parse(response, search);

      console.log(
        `[Trivago] Parse được ${hotels.length} hotels`
      );

      if (hotels.length > 0) {
        await insertHotels(hotels);
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

        if (
          consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS
        ) {
          console.error(
            `[Trivago] Tạm dừng ${COOLDOWN_MS / 1000}s để hạ nhiệt...`,
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
    `\n[Trivago] Total hotel records: ${allHotels.length}`
  );

  return allHotels;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  crawlAll()
    .then(async () => {
      await closePool();
      console.log("[Trivago] Done");
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("[Trivago] FATAL:", error);
      await closePool().catch(() => {});
      process.exit(1);
    });
}

export default {
  crawlAll,
};