function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const number = Number(
    String(value)
      .replace(/[^\d.,-]/g, "")
      .replace(",", "."),
  );

  return Number.isFinite(number) ? number : null;
}

function toInteger(value) {
  const number = toNumber(value);

  if (number === null) {
    return null;
  }

  return Math.round(number);
}

function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === undefined || value === null) {
    return false;
  }

  return ["true", "1", "yes"].includes(
    String(value).toLowerCase(),
  );
}

const BED_TYPE_LABELS = {
  "122:1": "Single Bed",
  "122:2": "Twin Bed",
  "122:3": "Double Bed",
  "122:4": "Full Bed",
  "122:5": "King Bed",
  "122:6": "Queen Bed",
  "122:7": "Sofa Bed",
};

function parseBedArrangements(roomInfo) {
  if (!Array.isArray(roomInfo)) {
    return [];
  }

  const items = [];

  for (const room of roomInfo) {
    const arrangements = room?.bedArrangements ?? [];

    for (const arr of arrangements) {
      for (const opt of arr?.bedOptions ?? []) {
        const nsid = opt?.bedTypeConcept?.nsid;
        const key = nsid ? `${nsid.ns}:${nsid.id}` : null;
        const label = (key && BED_TYPE_LABELS[key]) || "Bed";
        const count = toInteger(opt?.bedCount) ?? 1;

        items.push(
          count > 1
            ? `${count} ${label}s`
            : `${count} ${label}`,
        );
      }
    }
  }

  return [...new Set(items)];
}

function parseDescriptionAmenities(description) {
  if (!description) {
    return [];
  }

  const text = String(description);
  const found = [];

  if (/wi[- ]?fi/i.test(text)) {
    found.push("Wi-Fi");
  }

  if (/breakfast|bữa sáng|bua sang/i.test(text)) {
    found.push("Breakfast");
  }

  if (/free cancellation|miễn phí huỷ|miễn phí hủy|huy mien phi|hủy miễn phí/i.test(text)) {
  found.push("Free Cancellation");
}

  if (/sofa bed|giường sofa|giuong sofa/i.test(text)) {
    found.push("Sofa Bed");
  }

  if (/king/i.test(text)) {
    found.push("King Bed");
  }

  if (/twin/i.test(text)) {
    found.push("Twin Bed");
  }

  return found;
}

function parseDealAmenities(deal) {
  const out = [];

  const beds = parseBedArrangements(
    deal?.priceDetails?.roomInfo,
  );

  for (const bed of beds) {
    out.push(bed);
  }

  for (const amenity of parseDescriptionAmenities(
    deal?.description,
  )) {
    if (!out.includes(amenity)) {
      out.push(amenity);
    }
  }

  if (deal?.priceDetails?.freeCancellationDeadline) {
    if (!out.includes("Free Cancellation")) {
      out.push("Free Cancellation");
    }
  }

  return out;
}

function parseAmenities(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    const seen = new Set();
    const out = [];

    for (const item of value) {
      const label =
        typeof item === "string"
          ? item
          : firstValue(
              item?.name?.translation?.value,
              item?.translatedName?.value,
              item?.name,
              item?.label,
              item?.title,
              item?.text,
            );

      if (label && !seen.has(label)) {
        seen.add(label);
        out.push(label);
      }
    }

    return out;
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function parseCoordinates(hotel) {
  const details = hotel.accommodationDetails;

  const latitude = toNumber(
    firstValue(
      hotel.latitude,
      hotel.lat,
      hotel.location?.latitude,
      hotel.location?.lat,
      hotel.geo?.latitude,
      hotel.geo?.lat,
      hotel.coordinates?.latitude,
      hotel.coordinates?.lat,
      details?.coordinates?.latitude,
      details?.coordinates?.lat,
    ),
  );

  const longitude = toNumber(
    firstValue(
      hotel.longitude,
      hotel.lng,
      hotel.lon,
      hotel.location?.longitude,
      hotel.location?.lng,
      hotel.location?.lon,
      hotel.geo?.longitude,
      hotel.geo?.lng,
      hotel.coordinates?.longitude,
      hotel.coordinates?.lng,
      details?.coordinates?.longitude,
      details?.coordinates?.lng,
    ),
  );

  return {
    latitude,
    longitude,
  };
}

function parsePrice(hotel) {
  const price = firstValue(
    hotel.price,
    hotel.minPrice,
    hotel.totalPrice,
    hotel.price?.amount,
    hotel.price?.value,
    hotel.offer?.price,
    hotel.offer?.price?.amount,
    hotel.offer?.price?.value,
    hotel.cheapestOffer?.price,
    hotel.cheapestOffer?.price?.amount,
    hotel.deals?.cheapest?.allInPricePerNight?.amount,
    hotel.deals?.cheapest?.allInPricePerStay?.amount,
    hotel.deals?.best?.allInPricePerNight?.amount,
    hotel.deals?.best?.allInPricePerStay?.amount,
    hotel.allInPricePerNight?.amount,
  );

  return toNumber(price);
}

function parseRating(hotel) {
  const details = hotel.accommodationDetails;

  return toNumber(
    firstValue(
      hotel.starRating,
      hotel.stars,
      hotel.rating?.stars,
      hotel.category?.stars,
      details?.hotelClassification?.rating,
    ),
  );
}

function parseReviewScore(hotel) {
  const details = hotel.accommodationDetails;

  return toNumber(
    firstValue(
      hotel.reviewScore,
      hotel.reviewRating,
      hotel.rating?.score,
      hotel.reviews?.score,
      hotel.guestRating,
      details?.reviewRating?.formattedRating,
      details?.reviewRating?.trivagoRating,
    ),
  );
}

function parseReviewCount(hotel) {
  const details = hotel.accommodationDetails;

  return toInteger(
    firstValue(
      hotel.reviewCount,
      hotel.reviewsCount,
      hotel.rating?.reviewCount,
      hotel.reviews?.count,
      hotel.numberOfReviews,
      details?.reviewRating?.reviewsCount,
    ),
  );
}

function parseDealPrice(deal) {
  return toNumber(
    firstValue(
      deal?.allInPricePerNight?.amount,
      deal?.allInPricePerStay?.amount,
      deal?.pricePerNight?.amount,
      deal?.pricePerStayObject?.amount,
    ),
  );
}

function parseDealRow(accommodation, deal, searchParams) {
  const { latitude, longitude } =
    parseCoordinates(accommodation);

  const details = accommodation.accommodationDetails;

  const advertiser =
    deal?.advertiserDetails?.translatedName?.value;

  const dealAmenities = parseDealAmenities(deal);

  const existingAmenities = parseAmenities(
    firstValue(
      accommodation.amenities,
      accommodation.facilities,
      accommodation.features,
      details?.scoredAspectThemes,
    ),
  );

  const mergedAmenities = [
    ...new Set([
      ...dealAmenities,
      ...existingAmenities,
    ]),
  ];

  return {
    source: advertiser ?? "trivago",

    destination: searchParams.destination,
    location_id: searchParams.destinationId ?? null,

    checkin: searchParams.checkin,
    checkout: searchParams.checkout,
    stays: searchParams.stays,
    adults: searchParams.adults,

    hotel_id: firstValue(
      accommodation.hotelId,
      accommodation.id,
      accommodation.accommodationId,
      details?.nsid?.id
        ? `${details.nsid.ns}-${details.nsid.id}`
        : null,
    ),

    hotel_name: firstValue(
      accommodation.hotelName,
      accommodation.name,
      accommodation.title,
      accommodation.accommodationName,
      details?.translatedName?.value,
    ),

    accommodation_type: firstValue(
      accommodation.accommodationType,
      accommodation.type,
      accommodation.propertyType,
      accommodation.category?.name,
      details?.typeObject?.translatedName?.value,
    ),

    hotel_url: firstValue(
      accommodation.hotelUrl,
      accommodation.url,
      accommodation.detailsUrl,
      accommodation.links?.hotel,
      details?.userFriendlyUrl?.slug,
    ),

    price: parseDealPrice(deal),

    room_name: firstValue(
      deal?.description,
      null,
    ),

    currency: firstValue(
      deal?.currency,
      accommodation.currency,
      "VND",
    ),

    star_rating: parseRating(accommodation),

    review_score: parseReviewScore(accommodation),

    review_count: parseReviewCount(accommodation),

    review_label: firstValue(
      accommodation.reviewLabel,
      accommodation.rating?.label,
      accommodation.reviews?.label,
    ),

    address: firstValue(
      accommodation.address,
      accommodation.location?.address,
      accommodation.location?.formattedAddress,
      details?.address,
      details?.locality?.translatedName?.value,
    ),

    latitude,
    longitude,

    distance_reference: firstValue(
      accommodation.distanceReference,
      accommodation.distance,
      accommodation.location?.distance,
      accommodation.distanceLabel?.value,
    ),

    is_popular_highlights: toBoolean(
      firstValue(
        accommodation.isPopularHighlights,
        accommodation.isPopular,
        accommodation.popular,
        accommodation.highlights?.popular,
        details?.highlights?.popular,
      ),
    ),

    thumbnail_url: firstValue(
      accommodation.thumbnailUrl,
      accommodation.image,
      accommodation.imageUrl,
      accommodation.thumbnail,
      accommodation.images?.[0]?.url,
      details?.mainImageObject?.path,
    ),

    amenities: mergedAmenities,
  };
}

function parseHotel(hotel, searchParams) {
  const { latitude, longitude } =
    parseCoordinates(hotel);

  const details = hotel.accommodationDetails;

  return {
    source: "trivago",

    destination: searchParams.destination,

    location_id: searchParams.destinationId ?? null,

    checkin: searchParams.checkin,

    checkout: searchParams.checkout,

    stays: searchParams.stays,

    adults: searchParams.adults,

    hotel_id: firstValue(
      hotel.hotelId,
      hotel.id,
      hotel.accommodationId,
      details?.nsid?.id
        ? `${details.nsid.ns}-${details.nsid.id}`
        : null,
    ),

    hotel_name: firstValue(
      hotel.hotelName,
      hotel.name,
      hotel.title,
      hotel.accommodationName,
      details?.translatedName?.value,
    ),

    accommodation_type: firstValue(
      hotel.accommodationType,
      hotel.type,
      hotel.propertyType,
      hotel.category?.name,
      details?.typeObject?.translatedName?.value,
    ),

    hotel_url: firstValue(
      hotel.hotelUrl,
      hotel.url,
      hotel.detailsUrl,
      hotel.links?.hotel,
      details?.userFriendlyUrl?.slug,
    ),

    price: parsePrice(hotel),

    room_name: null,

    currency: firstValue(
      hotel.currency,
      hotel.price?.currency,
      "VND",
    ),

    star_rating: parseRating(hotel),

    review_score: parseReviewScore(hotel),

    review_count: parseReviewCount(hotel),

    review_label: firstValue(
      hotel.reviewLabel,
      hotel.rating?.label,
      hotel.reviews?.label,
    ),

    address: firstValue(
      hotel.address,
      hotel.location?.address,
      hotel.location?.formattedAddress,
      details?.address,
      details?.locality?.translatedName?.value,
    ),

    latitude,

    longitude,

    distance_reference: firstValue(
      hotel.distanceReference,
      hotel.distance,
      hotel.location?.distance,
      hotel.distanceLabel?.value,
    ),

    is_popular_highlights: toBoolean(
      firstValue(
        hotel.isPopularHighlights,
        hotel.isPopular,
        hotel.popular,
        hotel.highlights?.popular,
        details?.highlights?.popular,
      ),
    ),

    thumbnail_url: firstValue(
      hotel.thumbnailUrl,
      hotel.image,
      hotel.imageUrl,
      hotel.thumbnail,
      hotel.images?.[0]?.url,
      details?.mainImageObject?.path,
    ),

    amenities: parseAmenities(
      firstValue(
        hotel.amenities,
        hotel.facilities,
        hotel.features,
        details?.scoredAspectThemes,
      ),
    ),
  };
}

function findHotels(data) {
  if (!data) {
    return [];
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.hotels)) {
    return data.hotels;
  }

  if (Array.isArray(data.accommodations)) {
    return data.accommodations;
  }

  if (Array.isArray(data.results)) {
    return data.results;
  }

  if (Array.isArray(data.properties)) {
    return data.properties;
  }

  if (Array.isArray(data.items)) {
    return data.items;
  }

  if (data.accommodationSearchResponse) {
    return findHotels(data.accommodationSearchResponse);
  }

  if (data.search) {
    return findHotels(data.search);
  }

  return [];
}

class TrivagoParser {
  parse(response, searchParams) {
    if (!response) {
      return [];
    }

    const accommodations = findHotels(response);

    const rows = [];

    for (const acc of accommodations) {
      const deals = Array.isArray(acc.deals)
        ? acc.deals
        : null;

      if (deals && deals.length > 0) {
        for (const deal of deals) {
          const row = parseDealRow(
            acc,
            deal,
            searchParams,
          );

          if (row.hotel_name) {
            rows.push(row);
          }
        }
      } else {
        const row = parseHotel(
          acc,
          searchParams,
        );

        if (row.hotel_name) {
          rows.push(row);
        }
      }
    }

    return rows;
  }
}

export default new TrivagoParser();