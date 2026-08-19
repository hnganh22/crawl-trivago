const LOCALE = process.env.TRV_LOCALE ?? "vi";
const DOMAIN = "www.trivago.com";
const ROOMS = 1;
const DRS_PARAM = process.env.TRV_DRS_PARAM ?? "drs-48";
const VI_PREFIX = "khách-sạn";

const BASE_URL = `https://${DOMAIN}/${LOCALE}/srl`;

const COUNTRY_MAP = {
    "Ha Noi":         "việt nam",
    "Da Nang":        "việt nam",
    "Bangkok":        "thái lan",
    "Seoul":          "hàn quốc",
    "London":         "vương quốc anh",
    "Bali":           "indonesia",
    "Kuala Lumpur":   "malaysia",
    "New York":       "hoa kỳ",
    "Dubai":          "các tiểu vương quốc ả rập thống nhất",
    "Singapore":      "singapore",
};

const CITY_MAP = {
    "Ha Noi":         "hà nội",
    "Da Nang":        "đà nẵng",
    "Bangkok":        "bangkok",
    "Seoul":          "seoul",
    "London":         "london",
    "Bali":           "bali",
    "Kuala Lumpur":   "kuala lumpur",
    "New York":       "new york",
    "Dubai":          "dubai",
    "Singapore":      "singapore",
};

function slugify(city, country) {
    return `${VI_PREFIX}-${city}-${country}`
        .replace(/\s+/g, "-");
}

function formatCompactDate(iso) {
    return iso.replace(/-/g, "");
}

export function buildRefererUrl({
    destination,
    destinationId,
    checkin,
    checkout,
    adults,
}) {
    const city = CITY_MAP[destination];
    const country = COUNTRY_MAP[destination];

    if (!city || !country) {
        return BASE_URL;
    }

    const slug = encodeURIComponent(slugify(city, country));
    const search = `${destinationId};dr-${formatCompactDate(checkin)}-${formatCompactDate(checkout)};${DRS_PARAM};rc-${ROOMS}-${adults}`;

    return `${BASE_URL}/${slug}?search=${search}`;
}