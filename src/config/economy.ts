/** NPC trade prices, in coins. */
export const TRADE_PRICES = Object.freeze({
  equity: 10,
  incubatorEquity: 10,
  secondary: 20,
  grain: 1,
  coffee: 1,
  passenger: 5,
  fish: 5,
  uni: 40,
  sand: 20,
  saltLetter: 50,
  iphone: 100,
  robotaxi: 100,
  salesSoftware: 10,
  salesSoftwareResale: 20,
});

// Shared by trade settlement and discovery for offers that pay the player.
export const COIN_REWARD_TRADES = Object.freeze({
  'sales-software-sale': { coins: TRADE_PRICES.salesSoftwareResale, softwareCopies: -1 },
  'salt-letter-deliver': {
    saltLetters: -1,
    saltLettersDelivered: 1,
    coins: TRADE_PRICES.saltLetter,
  },
  'sand-sale': { coins: TRADE_PRICES.sand, sand: -1 },
  'fish-sale': { coins: TRADE_PRICES.fish, fish: -1 },
  'ai-lab-wage': { coins: 1 },
  secondary: { coins: TRADE_PRICES.secondary, equity: -1 },
  passenger: { coins: TRADE_PRICES.passenger },
  capital: { coins: 1000 },
  'monkey-quest': { coins: 25 },
});
