export const GROUND_ITEM_LIFETIME_SECONDS = 60;

export const sandwichStackLabel = (amount: number) =>
  amount + (amount === 1 ? ' sandwich' : ' sandwiches');

export function groundItemDeadline(clock: number, now: number) {
  return {
    expires: clock + GROUND_ITEM_LIFETIME_SECONDS,
    wallExpiresAt: now + GROUND_ITEM_LIFETIME_SECONDS * 1000,
  };
}

export function groundItemExpired(
  item: { expires: number; wallExpiresAt?: number },
  clock: number,
  now: number,
) {
  return item.expires <= clock + 1e-8 || (item.wallExpiresAt ?? Infinity) <= now;
}
