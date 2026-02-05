const NORMAL_RATE_PER_HOUR = 12;
const PEAK_RATE_PER_HOUR = 15;
const MAX_BOOKING_MONTHS_AHEAD = 3;
const PEAK_START_HOUR = 18;
const PEAK_END_HOUR = 23;

function isPeakHour(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const hour = date.getHours();
  return hour >= PEAK_START_HOUR && hour < PEAK_END_HOUR;
}

function resolveRates(pricing = {}) {
  const normalRate = Number(pricing.normalRate ?? NORMAL_RATE_PER_HOUR);
  const peakRate = Number(pricing.peakRate ?? PEAK_RATE_PER_HOUR);
  return {
    normalRate: Number.isFinite(normalRate) && normalRate > 0 ? normalRate : NORMAL_RATE_PER_HOUR,
    peakRate: Number.isFinite(peakRate) && peakRate > 0 ? peakRate : PEAK_RATE_PER_HOUR,
  };
}

function getHourlyRateByTime(value, pricing = {}) {
  const rates = resolveRates(pricing);
  return isPeakHour(value) ? rates.peakRate : rates.normalRate;
}

function getMaxAllowedDate(from = new Date()) {
  const next = new Date(from);
  next.setMonth(next.getMonth() + MAX_BOOKING_MONTHS_AHEAD);
  return next;
}

function calculateBookingPrice(start, end, pricing = {}) {
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
  const hourlyRate = getHourlyRateByTime(startDate, pricing);
  return Number((hours * hourlyRate).toFixed(2));
}

module.exports = {
  NORMAL_RATE_PER_HOUR,
  PEAK_RATE_PER_HOUR,
  PEAK_START_HOUR,
  PEAK_END_HOUR,
  MAX_BOOKING_MONTHS_AHEAD,
  isPeakHour,
  getHourlyRateByTime,
  getMaxAllowedDate,
  calculateBookingPrice,
};
