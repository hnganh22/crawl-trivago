import { sendGraphQL } from "../services/trivagoService.js";

import {
  buildAccommodationSearchPayload,
  buildAccommodationDealsPayload,
} from "../config/graphql.js";

import { sleep, jitter } from "../utils/sleep.js";

import {
  shouldTrip,
  BREAKER_MESSAGE,
} from "../utils/circuitBreaker.js";

import { buildRefererUrl } from "../utils/referer.js";

import { MAX_DEALS_PER_SEARCH } from "../config/config.js";

const MAX_POLL_ATTEMPTS = 10;
const POLL_INTERVAL = 1000;
const DEAL_DELAY = 300;

const OTA_KEYWORDS = ["agoda", "booking"];

const isAllowedOta = (name) => {
  const normalized = (name ?? "").trim().toLowerCase();

  return OTA_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

class TrivagoCrawler {
  async crawl(searchParams) {
    console.log("[Crawler] Starting search...");

    const payload = buildAccommodationSearchPayload(searchParams);

    const referer = buildRefererUrl(searchParams);

    const data = await sendGraphQL(payload, { Referer: referer });

    if (shouldTrip()) {
      throw new Error(BREAKER_MESSAGE);
    }

    let accommodations = this.extractResult(data);

    const responseRoot = data?.accommodationSearchResponse ?? {};

    let requestId = responseRoot.requestId;

    let pollData = responseRoot.pollData ?? null;

    /*
     * Search response chưa có accommodations
     * -> phải poll
     */
    if (!accommodations.length) {
      if (!requestId) {
        console.log("[Crawler] Không có requestId");

        return null;
      }

      console.log(`[Crawler] requestId: ${requestId}`);

      const result = await this.pollSearch(
        requestId,
        payload.variables,
        searchParams,
      );

      if (shouldTrip()) {
        throw new Error(BREAKER_MESSAGE);
      }

      if (!result) {
        return null;
      }

      accommodations = result.accommodations;

      requestId = result.requestId;

      pollData = result.pollData ?? pollData;
    }

    console.log(`[Crawler] Có ${accommodations.length} accommodations`);

    /*
     * Chỉ enrich deals cho tối đa MAX_DEALS_PER_SEARCH
     * accommodation đầu tiên — giảm request,
     * giảm rủi ro IP bị Akamai flag
     */
    const top = accommodations.slice(0, MAX_DEALS_PER_SEARCH);

    await this.enrichWithDeals(top, searchParams);

    if (shouldTrip()) {
      throw new Error(BREAKER_MESSAGE);
    }

    return {
      accommodations,
      requestId,
      pollData,
    };
  }

  async pollSearch(requestId, variables, searchParams) {
    let currentPollData = { requestId };

    const referer = buildRefererUrl(searchParams);

    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
      console.log(`[Crawler] Poll ${attempt}/${MAX_POLL_ATTEMPTS}`);

      /*
       * Dùng lại variables của search request
       * pollData lấy từ response trước nếu có,
       * nếu không thì chỉ gửi requestId
       */
      const pollVariables = {
        ...variables,

        pollData: currentPollData,
      };

      const payload = {
        variables: pollVariables,

        operationName: "accommodationSearchQuery",

        extensions: {
          persistedQuery: {
            version: 1,

            sha256Hash:
              "b84ba477a7397457b3de1507383e80e2a17dd4368f4bd41b255a19e33cfccd09",
          },
        },
      };

      try {
        const data = await sendGraphQL(payload, {
          Referer: referer,
          "x-trv-poll-number": String(attempt),
          "x-trv-poll-retry": "0",
        });

        const responseRoot = data?.accommodationSearchResponse ?? {};

        const accommodations = this.extractResult(data);

        if (responseRoot.pollData) {
          currentPollData = responseRoot.pollData;
        }

        if (accommodations.length > 0) {
          console.log(
            `[Crawler] Poll nhận được ${accommodations.length} accommodations`,
          );

          return {
            accommodations,

            requestId,

            pollData: currentPollData,
          };
        }
      } catch (error) {
        console.log(`[Crawler] Poll error: ${error.message}`);
      }

      if (shouldTrip()) {
        return null;
      }

      if (attempt < MAX_POLL_ATTEMPTS) {
        await sleep(jitter(POLL_INTERVAL));
      }
    }

    console.log(`[Crawler] Poll timeout: ${requestId}`);

    return null;
  }

  async enrichWithDeals(accommodations, searchParams) {
    const referer = buildRefererUrl(searchParams);

    /*
     * Crawler đã slice top-N trước khi gọi,
     * trong này không slice lại.
     */
    for (const accommodation of accommodations) {
      /*
       * accommodationSearchResponse có thể trả
       * nsid ở 2 vị trí khác nhau
       */
      const nsid =
        accommodation.accommodationDetails?.nsid ?? accommodation.nsid;

      if (!nsid?.ns || !nsid?.id) {
        accommodation.deals = [];

        continue;
      }

      try {
        /*
         * accommodationDealsQuery cần
         * accommodation ID thuộc ns = 100
         *
         * nsid lấy từ accommodation search
         */
        const accommodationId = nsid.id;

        const payload = buildAccommodationDealsPayload({
          accommodationId,

          checkin: searchParams.checkin,

          checkout: searchParams.checkout,

          adults: searchParams.adults,

          currency: searchParams.currency ?? "VND",
        });

        const data = await sendGraphQL(payload, {
          Referer: referer,
        });

        const deals = data?.getAccommodationDeals?.deals ?? [];

        /*
         * Chỉ giữ Agoda / Booking
         */
        accommodation.deals = deals.filter((deal) =>
          isAllowedOta(deal?.advertiserDetails?.translatedName?.value),
        );

        console.log(
          `[Crawler] ${
            accommodation.accommodationDetails?.translatedName?.value ??
            accommodationId
          }: ${accommodation.deals.length}/${deals.length} deals`,
        );
      } catch (error) {
        console.log(`[Crawler] Deals failed for ${nsid.id}: ${error.message}`);

        accommodation.deals = [];
      }

      if (shouldTrip()) {
        break;
      }

      await sleep(jitter(DEAL_DELAY));
    }
  }

  extractResult(data) {
    return data?.accommodationSearchResponse?.accommodations ?? [];
  }
}

export default new TrivagoCrawler();
