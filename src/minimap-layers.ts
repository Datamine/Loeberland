import { BURNING_MAN, type BurningManStage } from './burning-man.ts';
import { COIN_REWARD_TRADES } from './config/economy.ts';
import { COFFEE_STALL_VENDOR, HARDWARE_CLERK, RICH_TABLE_CHEF } from './config/npcs.ts';
import { CONTENT, subscribeContent } from './content-runtime.ts';
import { GOBLIN_PHONE_BUYER } from './goblin-industrialist.ts';
import { proofPrice, type ParrotQuestStage } from './stochastic-parrot.ts';
import type { ServiceNode } from './types/content.ts';
import { NEIGHBORHOOD_SERVICES } from './config/neighborhood-services.ts';
import { isFiniteNumber } from './types/json.ts';

interface MinimapActor {
  x: number;
  z: number;
  hp?: number;
  hidden?: boolean;
  kind?: string;
  combatKind?: string;
  expeditionRole?: string;
  questRole?: string;
  parrot?: boolean;
  stroller?: boolean;
  trade?: string | null;
  neighborhoodService?: string | null;
  id?: string;
}
interface MinimapContext {
  merchants?: readonly MinimapActor[];
  cityLife?: MinimapLife | null;
  southernLife?: MinimapLife | null;
  noeValleyLife?: MinimapLife | null;
  specialNPCLife?: MinimapLife | null;
  squareLife?: MinimapLife | null;
  socialLife?: MinimapLife | null;
  esotericCampus?: { life?: MinimapLife | null } | null;
  southernNeighborhood?: { residents: readonly MinimapActor[] } | null;
  restaurantDiners?: readonly MinimapActor[];
  parrots?: readonly MinimapActor[];
  wilderness?: { actors: readonly MinimapActor[] } | null;
  expeditions?: { cows: readonly MinimapActor[] } | null;
  chase?: { state: { officers: readonly { x: number; y: number }[] } } | null;
}
interface MinimapLife {
  people: readonly MinimapActor[];
}
const shopKinds = new Set([
  'airship-agent',
  'chef',
  HARDWARE_CLERK,
  COFFEE_STALL_VENDOR,
  'grain',
  'founder',
  'capital',
  'fuel-attendant',
  'hiking-supplier',
  'tablet-wizard',
  'haberdasher',
  'deli',
  'burger-clerk',
  'in-n-out-clerk',
  'bartender',
  'software-vendor',
  'tim-apple',
  'robotaxi-sales',
  'motorcycle-clerk',
  'lift',
  'battery-seller',
  'goblin-industrialist',
  'decorative-robe-seller',
  'enterprising-industrialist',
]);
const shopRoles = new Set(['armorer', 'square-coffee']);
const shopIds = new Set(['fighter-yard-tyler', 'industrious-goblin']);
// Gameplay tasks and trades settled outside the purse trade catalog.
const taskKinds = new Set([
  'capital',
  'construction-foreman',
  'goblin-scientist',
  'guild-master',
  'recruiter',
  'salt-activist',
  'software-buyer',
  'stockbroker',
  RICH_TABLE_CHEF,
  BURNING_MAN.matilda,
  BURNING_MAN.dj,
]);
const taskRoles = new Set(['armorer', 'clerk', 'esoteric']);
const taskIds = new Set(['ada-meridian', 'goblin-space-engineer', GOBLIN_PHONE_BUYER]);

interface TaskProgress {
  burningMan?: BurningManStage;
  parrot?: ParrotQuestStage;
  guildMember?: boolean;
}
function isRewardTrade(trade?: string | null) {
  return !!trade && Object.hasOwn(COIN_REWARD_TRADES, trade);
}

function offersReward(node: ServiceNode): boolean {
  return (
    isRewardTrade(node.trade) ||
    !!node.choices?.some(offersReward) ||
    (!!node.next && offersReward(node.next))
  );
}

function rewardServices(services: Record<string, ServiceNode>) {
  return new Set(
    Object.entries(services)
      .filter(([, node]) => offersReward(node))
      .map(([kind]) => kind),
  );
}
let payingServices = rewardServices(CONTENT.dialogues.services);
subscribeContent(({ dialogues }) => {
  payingServices = rewardServices(dialogues.services);
});

function neighborhoodOffers(npc: MinimapActor) {
  return npc.neighborhoodService
    ? NEIGHBORHOOD_SERVICES[npc.neighborhoodService]?.offers
    : undefined;
}

/** All layers share the same actor sources and use live rendered positions. */
export function minimapActors(context: MinimapContext) {
  return [
    ...new Set([
      ...(context.merchants || []),
      ...(
        [
          'cityLife',
          'southernLife',
          'noeValleyLife',
          'specialNPCLife',
          'squareLife',
          'socialLife',
        ] as const
      ).flatMap((key) => context[key]?.people || []),
      ...(context.esotericCampus?.life?.people || []),
      ...(context.southernNeighborhood?.residents || []),
      ...(context.restaurantDiners || []),
      ...(context.parrots || []),
      ...(context.wilderness?.actors || []),
      ...(context.expeditions?.cows || []),
      ...(context.chase?.state.officers || []).map((n): MinimapActor => ({
        ...n,
        x: n.x + 0.5,
        z: n.y + 0.5,
      })),
    ]),
  ].filter(
    (n) =>
      isFiniteNumber(n.x) && isFiniteNumber(n.z) && (n.hp === undefined || n.hp > 0) && !n.hidden,
  );
}
export function minimapShops<T extends MinimapActor>(actors: readonly T[]) {
  return actors.filter(
    (n) =>
      shopKinds.has(n.kind ?? '') ||
      shopRoles.has(n.questRole ?? '') ||
      shopIds.has(n.id ?? '') ||
      n.combatKind === 'goblin-maker' ||
      neighborhoodOffers(n)?.some((offer) => (offer.price ?? 0) > 0),
  );
}

export function minimapTasks<T extends MinimapActor>(
  actors: readonly T[],
  progress: TaskProgress = {},
) {
  return actors.filter(
    (n) =>
      taskKinds.has(n.kind ?? '') ||
      taskRoles.has(n.questRole ?? '') ||
      taskIds.has(n.id ?? '') ||
      payingServices.has(n.kind ?? '') ||
      isRewardTrade(n.trade) ||
      (n.stroller && n.id?.startsWith('noe-parent-')) ||
      (n.id === BURNING_MAN.waterClerk && progress.burningMan === 'fetch-water') ||
      (n.parrot && progress.parrot === 'accepted') ||
      (progress.parrot === 'proof' && proofPrice(n.id) > 0) ||
      (progress.guildMember && n.kind === 'illuminati-elder') ||
      n.expeditionRole === 'scientist' ||
      n.expeditionRole === 'ahab' ||
      neighborhoodOffers(n)?.some((offer) => (offer.reward ?? 0) > 0),
  );
}
