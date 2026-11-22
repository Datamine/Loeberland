export interface TradeLine {
  id: string;
  quantity: number;
}
export interface TradeItem extends TradeLine {
  name: string;
  wholeHolding?: boolean;
}
export interface TradeSide {
  name: string;
  offer: TradeItem[];
  confirmed: boolean;
}
export interface TradeView {
  id: string;
  revision: number;
  phase: 'invited' | 'open';
  requester: boolean;
  you: TradeSide;
  partner: TradeSide;
  available: TradeItem[];
}
