import { sendGraphQL } from "../services/trivagoService.js";
import {
    buildAccommodationSearchPayload,
    buildAccommodationDealsPayload,
    buildItemCardInsights,
} from "../config/graphql.js";

import { sleep, jitter } from "../utils/sleep.js";
import { MAX_DEALS_PER_SEARCH } from "../config/config.js";

import {
    recordSuccess,
    recordForbidden,
    shouldTrip,
    BREAKER_MESSAGE,
} from "../utils/circuitBreaker.js";

const MAX_POLL_ATTEMPTS = 10;
const POLL_INTERVAL = 1000;
const DEAL_DELAY = 300;

const OTA_KEYWORDS = ["agoda", "booking"];

const isAllowedOta = (name) => {
    const normalized = (name ?? "").trim().toLowerCase();

    return OTA_KEYWORDS.some((keyword) =>
        normalized.includes(keyword),
    );
};

// Sử dụng trực tiếp URL đã sinh từ link generator
function getRefererUrl(searchParams) {
    return searchParams?.url || "https://www.trivago.com/";
}

class TrivagoCrawler {
    async crawl(searchParams) {
        console.log(
            `[Crawler] Bắt đầu tìm kiếm: ${searchParams.destination}`,
        );

        const payload = buildAccommodationSearchPayload(searchParams);
        const referer = getRefererUrl(searchParams);

        const data = await sendGraphQL(payload, { Referer: referer });

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

            // lỗi
            const result = await this.pollSearch(
                requestId,
                payload.variables,
                searchParams,
                pollData
            );

            if (!result) {
                return null;
            }

            accommodations = result.accommodations;

            requestId = result.requestId;

            pollData = result.pollData ?? pollData;
        }

        console.log(`[Crawler] Có ${accommodations.length} accommodations`);

        const top = accommodations.slice(0, MAX_DEALS_PER_SEARCH);

        await this.enrichWithDeals(
            top,
            searchParams, 
            requestId
        );

        return {
            accommodations,
            requestId,
            pollData,
        };
    }

    async pollSearch(
        requestId,
        variables,
        searchParams,
        initialPollData = null
    ) {
        // Tái sử dụng initialPollData nếu có
        let currentPollData = initialPollData ?? { requestId };

        const referer = getRefererUrl(searchParams);

        for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
            console.log(`[Crawler] Poll ${attempt}/${MAX_POLL_ATTEMPTS}`);

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
                            "6440ec202e6dd7b2bee1a0901108974c374b9cd6b7a084cdc1f03993f47ed892",
                    },
                },
            };

            try {
                const data = await sendGraphQL(
                    payload,
                    {
                        Referer: referer,
                        "x-trv-poll-number": String(attempt),
                        "x-trv-poll-retry": "0",
                    },
                );

                const responseRoot =
                    data?.accommodationSearchResponse ?? {};

                const accommodations = this.extractResult(data);

                if (responseRoot.pollData) {
                    currentPollData = responseRoot.pollData;
                }

                if (accommodations.length > 0) {
                    recordSuccess();

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
                const isBlocked =
                    error.code === "BLOCKED" ||
                    error.code === "AUTH_REQUIRED";

                if (isBlocked) {
                    recordForbidden();

                    if (shouldTrip()) {
                        throw new Error(BREAKER_MESSAGE);
                    }
                }

                console.log(`[Crawler] Poll error: ${error.message}`);
            }

            if (attempt < MAX_POLL_ATTEMPTS) {
                await sleep(jitter(POLL_INTERVAL));
            }
        }

        console.log(`[Crawler] Poll timeout: ${requestId}`);

        return null;
    }
//sua di
    async enrichWithDeals(accommodations, searchParams, requestId, concurrency = 3) {
        const queue = [...accommodations];

        const workers = Array.from({ length: concurrency }, async () => {
            while (queue.length > 0) {
                const accommodation = queue.shift();
                if (accommodation) {
                    await this.fetchDealsFor(accommodation, searchParams, requestId);
                    await sleep(jitter(DEAL_DELAY));
                }
            }
        });

        await Promise.all(workers);
    }

    async fetchDealsFor(accommodation, searchParams, requestId) {
        const referer = getRefererUrl(searchParams);
        const nsid =
            accommodation.accommodationDetails?.nsid ?? accommodation.nsid;

        if (!nsid?.ns || !nsid?.id) {
            accommodation.deals = [];
            return;
        }

        const accommodationId = `${nsid.ns}/${nsid.id}`;

        try {
            const itemCardInsights = buildItemCardInsights(accommodation.deals);
            const payload = buildAccommodationDealsPayload({
                accommodationId,
                checkin: searchParams.checkin,
                checkout: searchParams.checkout,
                adults: searchParams.adults,
                currency: searchParams.currency ?? "VND",
                requestId: requestId, 
                itemCardInsights,
            });

            const data = await sendGraphQL(
                payload,
                { Referer: referer },
            );

            const deals = data?.getAccommodationDeals?.deals ?? [];

            accommodation.deals = deals.filter((deal) =>
                isAllowedOta(
                    deal?.advertiserDetails?.translatedName?.value,
                ),
            );

            recordSuccess();

            console.log(
                `[Crawler] ${
                    accommodation.accommodationDetails
                        ?.translatedName?.value ?? accommodationId
                }: ${accommodation.deals.length}/${deals.length} deals`,
            );
        } catch (error) {
            const isBlocked =
                error.code === "BLOCKED" ||
                error.code === "AUTH_REQUIRED";

            if (isBlocked) {
                recordForbidden();

                if (shouldTrip()) {
                    throw new Error(BREAKER_MESSAGE);
                }
            }

            console.log(
                `[Crawler] Deals failed for ${nsid.id}: ${error.message}`,
            );

            accommodation.deals = [];
        }
    }

    extractResult(data) {
        return (
            data?.accommodationSearchResponse?.accommodations ?? []
        );
    }
}

export default new TrivagoCrawler();