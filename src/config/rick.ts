import type { Parcel } from '../types/parcels.ts';

export const RICK_HOUSE = {
  id: 'ricks-house',
  name: 'Rick’s House',
  parcelId: 'peninsula-settlement-35',
} as const;

export const isRickHousePlot = (parcel: Parcel) =>
  'id' in parcel && parcel.id === RICK_HOUSE.parcelId;

export const RICK = {
  id: 'rick',
  name: 'Rick',
  description: 'truly futuristic',
} as const;

export const TECHWEAR_ITEMS = ['techwear-top', 'techwear-bottoms'] as const;
