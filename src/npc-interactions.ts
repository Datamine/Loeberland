import type { ActorMetadata } from './types/world.ts';
import { MERCHANTS } from './config/npcs.ts';
import { applyEntityEdits } from './world-edits.ts';
import { POOL_SWIMMER } from './communal-pool.ts';
import { AIRSHIP_TRAVELER } from './airship-rope.ts';
/** Menu capability, shared by combat labels and action construction. */
export function npcOffersAttack(npc: ActorMetadata = {}) {
  if (
    npc.networkPlayer ||
    npc.id === 'nia' ||
    npc.kind === AIRSHIP_TRAVELER ||
    npc.kind === POOL_SWIMMER ||
    npc.kind === 'cafe-patron' ||
    (typeof npc.id === 'string' &&
      (npc.id.startsWith('cotogna-diner-') || npc.id.startsWith('rich-table-diner-')))
  )
    return false;
  if (
    npc.wilderness ||
    (['raptor', 'cow', 'kraken', 'spectre'] satisfies [string, string, string, string]).includes(
      npc.combatKind || '',
    )
  )
    return true;
  if (
    npc.dogSurfJudge ||
    npc.neighborhoodService ||
    npc.police ||
    npc.kind === 'atv-rental' ||
    npc.kind === 'goblin-scientist' ||
    npc.kind === 'goblin-plumber' ||
    npc.kind === 'goblin-frog-farmer' ||
    npc.kind === 'goblin-space-engineer' ||
    npc.kind === 'goblin-industrialist' ||
    npc.kind === 'decorative-robe-seller' ||
    npc.kind === 'fighter-yard-host' ||
    npc.kind === 'construction-foreman' ||
    npc.kind === 'mud-bath-regular' ||
    npc.kind === 'enterprising-industrialist' ||
    npc.kind === 'legacy-developer' ||
    npc.kind === 'biomed-entrepreneur' ||
    npc.kind === 'berkeley-mathematician' ||
    npc.kind === 'churchgoer' ||
    npc.kind?.startsWith('burning-man-') ||
    npc.kind === 'rene-girard' ||
    npc.keeper ||
    npc.parrot ||
    npc.rehabilitation ||
    npc.expeditionRole ||
    npc.questRole ||
    npc.researcher ||
    npc.child ||
    npc.baby ||
    npc.dog === true
  )
    return false;
  return (
    !(
      [
        'yohji',
        'hiking-supplier',
        'illuminati-elder',
        'tablet-wizard',
        'banker',
        'guild-master',
        'market-farmer',
        'recruiter',
        'deli',
        'bartender',
        'burger-clerk',
        'rail-worker',
      ] satisfies [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    ).includes(npc.kind || '') && !MERCHANTS[npc.kind || '']
  );
}
export function npcDisplayLabel(
  npc: ActorMetadata,
  { revealed = false, level = 1, combat = true } = {},
) {
  applyEntityEdits(npc, npc.editorKey || 'actor:' + npc.id);
  const name = revealed ? 'Alien' : npc.serviceTitle || npc.label || 'Person';
  if (!combat) return name;
  if (npc.networkPlayer) return name + ' - Level ' + level;
  return name + (npcOffersAttack(npc) ? ' (Level ' + level + ')' : '');
}
export function npcPrimaryVerb(npc: ActorMetadata, revealed = false) {
  if (npc.wilderness)
    return npc.combatKind === 'bear'
      ? 'pet'
      : npc.combatKind === 'goblin-maker' ||
          npc.combatKind === 'bolinas-cultist' ||
          npc.combatKind === 'unusual-pastor'
        ? 'talk'
        : 'attack';
  if (npc.police) return 'examine';
  if (npc.networkPlayer) return 'walk';
  return revealed || ['raptor', 'cow', 'kraken'].includes(npc.combatKind || '') ? 'attack' : 'talk';
}

/** Both ordinary clicks and context-menu actions dispatch through the same
 * actor interaction handler. Keep menu eligibility independent of rendering. */
export function npcContextActions(
  npc: ActorMetadata = {},
  { primary = 'talk', duel = false, pvp = false } = {},
) {
  if (npc.kind === AIRSHIP_TRAVELER) return ['talk', 'examine'];
  if (npc.networkPlayer)
    return ['trade', ...(duel ? ['duel'] : []), 'follow', ...(pvp ? ['attack'] : []), 'walk'];
  let actions: string[];
  if (npc.police) actions = [];
  else if (npc.wilderness)
    actions =
      npc.combatKind === 'bear'
        ? ['pet', 'attack']
        : npc.combatKind === 'goblin-maker' ||
            npc.combatKind === 'bolinas-cultist' ||
            npc.combatKind === 'unusual-pastor'
          ? ['talk', 'attack']
          : ['attack'];
  else if (
    (['raptor', 'cow', 'kraken'] satisfies [string, string, string]).includes(npc.combatKind || '')
  )
    actions = ['attack'];
  else if (!npcOffersAttack(npc)) actions = ['talk'];
  else actions = primary === 'attack' ? ['attack', 'talk'] : ['talk', 'attack'];
  return [...actions, 'walk', 'examine'];
}
export function promoteWalkAction(menu: HTMLDivElement) {
  const buttons = [...menu.querySelectorAll<HTMLElementTagNameMap['button']>('button')],
    walk = buttons.find((b) => /^Walk (here|to entrance)(?:$| )/.test(b.textContent || ''));
  if (walk && buttons[0] !== walk && !/^Take /.test(buttons[0]?.textContent || ''))
    menu.insertBefore(walk, buttons[0]);
}
