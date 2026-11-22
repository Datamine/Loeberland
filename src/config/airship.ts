/** Shared airship timetable and escalating rental bids. */
export const AIRSHIP_RULES = Object.freeze({
  resetIntervalMs: 20 * 60 * 1000,
  initialPrice: 5,
  bidIncrement: 5,
  reservationMs: 60 * 1000,
});
