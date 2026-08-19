export const BASE_URL = "https://www.trivago.com/";

export const DESTINATION = {
    "Ha Noi":        "200-68088",
    "Da Nang":       "200-68104",
    "Bangkok":       "200-15893",
    "Seoul":         "200-81393",
    "London":        "200-17399",   
    "Bali":          "200-72435",
    "Kuala Lumpur":  "200-56340",
    "New York":      "200-14734",
    "Dubai":         "200-15075",
    "Singapore":     "200-25025",
}
 
export const CHECKIN_OFFSETS = [1,7,30,90];

export const STAYS = [1,4];

export const ADULTS = [1,2]; 

export const SOURCE = {
    AGODA: "Agoda",
    BOOKING: "Booking.com"
};

export const HEADERS = {
    Accept: "application/graphql-response+json, application/json",
    "Content-Type": "application/json",
    "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
    Origin: "https://www.trivago.com",
    "apollographql-client-name": "hs-web-app",
    "apollographql-client-version": "e328aadc",
    "x-trv-app-id": "HS_WEB_APP_WARP",
};

export const SESSION_HEADERS = {
    cookie: process.env.TRV_COOKIE ?? "",
    "x-trv-tid": process.env.TRV_TID ?? "",

    "x-trv-language": process.env.TRV_LANGUAGE ?? "",
    "x-trv-platform": process.env.TRV_PLATFORM ?? "",
    "x-trv-currency": process.env.TRV_CURRENCY ?? "",

    "x-trv-connection-id":
        process.env.TRV_CONNECTION_ID ?? "",
    "x-trv-cst": process.env.TRV_CST ?? "",
    "x-trv-sequence-id":
        process.env.TRV_SEQUENCE_ID ?? "",

    "x-trv-poll-id": process.env.TRV_POLL_ID ?? "",
    "x-trv-poll-number":
        process.env.TRV_POLL_NUMBER ?? "0",
    "x-trv-poll-retry":
        process.env.TRV_POLL_RETRY ?? "0",
    "x-trv-sees-results":
        process.env.TRV_SEES_RESULTS ?? "false",
};

export function buildHeaders(extra = {}) {
    const merged = { ...HEADERS, ...SESSION_HEADERS, ...extra };
    return Object.fromEntries(
        Object.entries(merged).filter(
            ([, v]) => v !== "" && v !== undefined && v !== null,
        ),
    );
}  

export const TIMEOUT = 30000;
export const RETRY = 3;

export const REQUEST_DELAY = 1500;

export const MAX_DEALS_PER_SEARCH = Number(
    process.env.MAX_DEALS_PER_SEARCH ?? 5,
);

const _BATCH_SIZE_RAW = process.env.BATCH_SIZE;
const _BATCH_SIZE_PARSED = _BATCH_SIZE_RAW ? Number(_BATCH_SIZE_RAW) : NaN;
export const BATCH_SIZE =
    Number.isFinite(_BATCH_SIZE_PARSED) && _BATCH_SIZE_PARSED > 0
        ? _BATCH_SIZE_PARSED
        : null;