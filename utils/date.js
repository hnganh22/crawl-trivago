function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function addDays(date, days) {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
}

export function getDateFromOffset(offset) {
  const today = new Date();

  return formatDate(addDays(today, offset));
}

export function getCheckoutDate(checkin, stays) {
  const date = new Date(`${checkin}T00:00:00`);

  return formatDate(addDays(date, stays));
}

export function createDateRange(checkinOffset, stays) {
  const checkin = getDateFromOffset(checkinOffset);
  const checkout = getCheckoutDate(checkin, stays);

  return {
    checkin,
    checkout,
    stays,
  };
}