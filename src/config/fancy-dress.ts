export const FANCY_DRESS = {
  id: 'fancy-dress-merchant',
  name: 'Fancy Dress Merchant',
  x: 34,
  z: 80,
  outfit: {
    neck: 'white-scarf',
    legs: 'blue-jeans',
    torso: 'silk-kimono',
    hat: 'napoleon-hat',
    weapon: 'bowling-ball',
  },
} as const;

export const FANCY_DRESS_ITEMS = ['white-scarf', 'blue-jeans', 'silk-kimono', 'bowling-ball'] as const;
export const FANCY_DRESS_HATS = ['napoleon-hat', 'gnome-cap'] as const;
