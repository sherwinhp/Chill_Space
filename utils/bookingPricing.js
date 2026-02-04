const NORMAL_RATE_PER_HOUR = 12;
const PEAK_RATE_PER_HOUR = 15;
const MAX_BOOKING_MONTHS_AHEAD = 3;

function isPeakDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getDay();
  // Friday, Saturday, Sunday are peak days.
  return day === 5 || day === 6 || day === 0;
}

function getHourlyRateByDate(value) {
  return isPeakDate(value) ? PEAK_RATE_PER_HOUR : NORMAL_RATE_PER_HOUR;
}

function getMaxAllowedDate(from = new Date()) {
  const next = new Date(from);
  next.setMonth(next.getMonth() + MAX_BOOKING_MONTHS_AHEAD);
  return next;
}

function calculateBookingPrice(start, end) {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate <= startDate
  ) {
    return 0;
  }
  const hours = (endDate - startDate) / 3600000;
  const hourlyRate = getHourlyRateByDate(startDate);
  return Number((hours * hourlyRate).toFixed(2));
}

module.exports = {
  NORMAL_RATE_PER_HOUR,
  PEAK_RATE_PER_HOUR,
  MAX_BOOKING_MONTHS_AHEAD,
  isPeakDate,
  getHourlyRateByDate,
  getMaxAllowedDate,
  calculateBookingPrice,
};

