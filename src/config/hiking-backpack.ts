export const HIKING_BACKPACK = 'backpack';
export const UPGRADED_HIKING_BACKPACK = 'upgraded-backpack';
export const HIKING_BACKPACK_UPGRADE_KIT = 'hiking-backpack-upgrade-kit';

export function isHikingBackpack(id: unknown) {
  return id === HIKING_BACKPACK || id === UPGRADED_HIKING_BACKPACK;
}
