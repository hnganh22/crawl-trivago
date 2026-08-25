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
    "apollographql-client-version": "3bbdda8f",
    "x-trv-app-id": "HS_WEB_APP_WARP",
    "user-agent" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
};

export const TIMEOUT = 30000;
export const RETRY = 3;

export const REQUEST_DELAY = 1500;

export const MAX_DEALS_PER_SEARCH = Number(
    process.env.MAX_DEALS_PER_SEARCH ?? 5,
);

export const BATCH_SIZE = Number(process.env.BATCH_SIZE) > 0 ? Number(process.env.BATCH_SIZE) : null;