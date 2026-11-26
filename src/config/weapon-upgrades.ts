export const WEAPON_UPGRADE_KIT = 'railgun-upgrade';
export const UPGRADED_RAILGUN = 'upgraded-railgun';
export const UPGRADED_AKIMBO = 'upgraded-akimbo';

export function upgradedWeaponId(weapon: unknown) {
  if (weapon === 'railgun') return UPGRADED_RAILGUN;
  if (weapon === 'akibo') return UPGRADED_AKIMBO;
}

export function baseWeaponId(id: string) {
  if (id === UPGRADED_RAILGUN) return 'railgun';
  if (id === UPGRADED_AKIMBO) return 'akibo';
  return id;
}
