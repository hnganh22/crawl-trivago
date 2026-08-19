// config/graphql.js

export const GRAPHQL_URL = "https://www.trivago.com/graphql";

export const ACCOMMODATION_SEARCH = {
  operationName: "accommodationSearchQuery",
  extensions: {
    persistedQuery: {
      version: 1,
      sha256Hash:
        "6440ec202e6dd7b2bee1a0901108974c374b9cd6b7a084cdc1f03993f47ed892",
    },
  },
};

export const ACCOMMODATION_DEALS = {
  operationName: "accommodationDealsQuery",
  extensions: {
    persistedQuery: {
      version: 1,
      sha256Hash:
        "4cfe44ccb2a332ee1688312ef158327a9e05fc4c3bdde59b86a2e558a24731f0",
    },
  },
};

function parseDestinationId(destinationId) {
  const [ns, id] = String(destinationId).split("-").map(Number);
  return { ns, id };
}

export function buildAccommodationSearchPayload({
  destinationId,
  checkin,
  checkout,
  adults = 2,
  currency = "VND",
  pollData = null, // Thêm để tái sử dụng khi polling
}) {
  const { ns, id } = parseDestinationId(destinationId);

  const uiv = [{ nsid: { ns, id } }];

  return {
    operationName: ACCOMMODATION_SEARCH.operationName,
    extensions: ACCOMMODATION_SEARCH.extensions,
    variables: {
      pollData,
      aiGeneratedInput: {
        filter: { sentiment: "POSITIVE" },
        sorting: { searchConcepts: [] },
        pagination: { limit: 2 },
      },
      contextAwareContent: {
        rooms: [{ adults, children: [] }],
        stayPeriod: { arrival: checkin, departure: checkout },
        uiv,
      },
      distanceLabelInput: null,
      limitedTimeOfferInput: { arrival: checkin, departure: checkout },
      mainImageConcepts: [],
      monthlyForecastedPricesInput: {
        currencyCode: currency,
        filter: [{ priceType: "CHEAPEST", yearMonth: checkin.slice(0, 7) }],
      },
      params: {
        uiv,
        searchExecutionContext: { searchType: "MULTI_POLL_WITH_DEALS" },
        applicationGroup: "MAIN_WARP",
        budgetRestriction: {
          budgetType: "PRICE_PER_NIGHT",
          minPrice: 0,
          maxPrice: 2147483647,
        },
        channel: {
          branded: {
            isStandardDate: false,
            stayPeriodSource: { value: 40 },
          },
        },
        currency,
        dealsLimit: 3,
        deviceType: "DESKTOP_CHROME",
        includePriceHistogram: true,
        limit: 35,
        offset: 0,
        rooms: [{ adults, children: [] }],
        searchResultViewType: "LIST_VIEW",
        sorting: [{ type: 0 }],
        stayPeriod: { arrival: checkin, departure: checkout },
      },
      priceSliderParams: {
        currency,
        priceHistogramAlgorithmType: "LINEAR",
      },
      shouldIncludeAspectBadges: true,
      shouldIncludeCanonicalURL: false,
      shouldIncludeEligiblePartners: true,
      shouldIncludeForecastedPrice: false,
      shouldIncludeFreeSearchDetails: false,
      shouldIncludeHotelOffers: true,
      shouldIncludeMainImageBasedOnConcepts: false,
      shouldIncludeMonthlyForecastedPrices: false,
      shouldIncludePersonalisation: true,
      shouldIncludeRoomTypeInfo: true,
      shouldIncludeShortenedReviewsCount: true,
      shouldIncludeTierSavings: false,
    },
  };
}

export function buildAccommodationDealsPayload({
  accommodationId,
  checkin,
  checkout,
  adults = 2,
  currency = "VND",
  pollData = null, // Thêm để tái sử dụng khi polling
}) {
  // Lấy đúng số cuối nếu ID truyền vào dạng "100-12345" hoặc "12345"
  const numericAccommodationId = Number(String(accommodationId).split("-").pop());

  return {
    operationName: ACCOMMODATION_DEALS.operationName,
    extensions: ACCOMMODATION_DEALS.extensions,
    variables: {
      pollData,
      getAccommodationDealsParams: {
        accommodationNsid: {
          ns: 100,
          id: numericAccommodationId,
        },
        applicationGroup: "MAIN_WARP",
        channel: {
          branded: {
            isStandardDate: false,
            stayPeriodSource: { value: 40 },
          },
        },
        currency,
        rooms: [{ adults, children: [] }],
        stayPeriod: { arrival: checkin, departure: checkout },
        uiv: [],
        limitedTimeOfferInput: { arrival: checkin, departure: checkout },
        percentiles: { lowerPercentile: 30, upperPercentile: 70 },
      },
      shouldIncludeFreeWiFiStatus: false,
      shouldIncludeHotelOffers: false,
      shouldIncludeInsightsReflection: false,
      shouldIncludeRoomsTabInformation: false,
      shouldIncludeTierSavings: false,
    },
  };
}