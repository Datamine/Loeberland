import type { QuestJournalEntry } from './quest-menu.ts';
import type { AlienProgress, MonkeyStage } from './types/content.ts';
import type { Economy, QuestLog } from './types/controllers.ts';
import { isOneOf, isRecord } from './types/json.ts';
// CONTENT-BINDINGS-MIGRATED
import { contentText } from './content-runtime.ts';
import { createTheyLiveQuest } from './they-live.ts';
import type { ActionReceipt, Actor } from './types/world.ts';
import {
  PARROT_QUEST_STAGES,
  parrotQuestEntry,
  type ParrotQuestStage,
} from './stochastic-parrot.ts';
export const MONKEY_QUEST = Object.freeze({
  id: 'monkey-business',
  title: 'Monkey Business',
  professor: 'Professor Ada Meridian',
  startLocation:
    'the ' +
    contentText('southern-settlement-layout.module.label-1', {}) +
    ' (speak to Professor Ada Meridian)',
  reward: 25,
});
const questStages: readonly string[] = [
  'not-started',
  'accepted',
  'carrying',
  'completed',
] satisfies [string, string, string, string];
/** A small persistent state machine. Quest rewards commit exactly once. */
export function createQuestLog(
  savedInput: unknown = {},
  onChange: (value: {
    monkey: MonkeyStage;
    theyLive: AlienProgress;
    stochasticParrot: ParrotQuestStage;
  }) => void = () => {},
) {
  const saved = isRecord(savedInput) ? savedInput : {};

  function changed() {
    onChange({ ...state, theyLive: { ...theyLive.state, defeated: [...theyLive.state.defeated] } });
  }
  const theyLive = createTheyLiveQuest(saved?.theyLive, changed);
  const state: {
    monkey: MonkeyStage;
    theyLive: AlienProgress;
    stochasticParrot: ParrotQuestStage;
  } = {
    monkey:
      typeof saved.monkey === 'string' && questStages.includes(saved.monkey)
        ? (saved.monkey as MonkeyStage)
        : 'not-started',
    theyLive: theyLive.state,
    stochasticParrot: isOneOf(PARROT_QUEST_STAGES, saved.stochasticParrot)
      ? saved.stochasticParrot
      : 'not-started',
  };
  function advanceParrot(stage: Exclude<ParrotQuestStage, 'sold'>) {
    if (state.stochasticParrot !== stage) return false;
    state.stochasticParrot = PARROT_QUEST_STAGES[PARROT_QUEST_STAGES.indexOf(stage) + 1];
    changed();
    return true;
  }
  const change = (stage: MonkeyStage) => {
    state.monkey = stage;
    changed();
  };
  function accept() {
    if (state.monkey !== 'not-started')
      return {
        ok: false,
        message: contentText('world-message.src.quests.this-quest-is-already-in-your-journal'),
      };
    change('accepted');
    return {
      ok: true,
      message: contentText('world-message.src.quests.quest-started-monkey-business'),
    };
  }
  function steal() {
    if (state.monkey === 'not-started')
      return {
        ok: false,
        message: contentText('world-message.src.quests.the-monkey-eyes-you-suspiciously'),
      };
    if (state.monkey !== 'accepted')
      return {
        ok: false,
        message: contentText('world-message.src.quests.you-already-have-your-research-assistant'),
      };
    change('carrying');
    return {
      ok: true,
      message: contentText(
        'world-message.src.quests.the-monkey-steals-your-hat-then-climbs-onto-your-shoulder',
      ),
    };
  }
  function recover() {
    if (state.monkey !== 'carrying') return { ok: false };
    change('accepted');
    return {
      ok: true,
      message: contentText(
        'world-message.src.quests.the-zookeeper-catches-you-and-returns-the-monkey-to-its-enclos',
      ),
    };
  }
  function complete(economy: Economy) {
    if (state.monkey !== 'carrying')
      return {
        ok: false,
        message: contentText('world-message.src.quests.first-bring-a-monkey-from-the-zoo'),
      };
    const result = economy.trade('monkey-quest');
    if (!result.ok) return result;
    change('completed');
    return {
      ok: true,
      message: contentText(
        'world-message.src.quests.quest-complete-monkey-business-you-receive-25-coins-the-monkey',
      ),
    };
  }
  function entry() {
    const stage = state.monkey,
      descriptions = {
        'not-started': 'You have not begun this adventure.',
        accepted: 'Professor Meridian has asked for a rather unconventional research assistant.',
        carrying: 'The monkey is riding on your shoulder.',
        completed:
          'Professor Meridian has her new colleague. The monkey negotiated tenure before opening its first banana.',
      };
    return {
      ...MONKEY_QUEST,
      stage,
      status: {
        'not-started': 'Not started',
        accepted: 'In progress',
        carrying: 'Ready to turn in',
        completed: 'Complete',
      }[stage],
      description: descriptions[stage],
    };
  }
  return {
    state,
    theyLive,
    accept,
    steal,
    recover,
    complete,
    entry,
    advanceParrot,
    entries: (): QuestJournalEntry[] => [
      theyLive.entry(),
      entry(),
      parrotQuestEntry(state.stochasticParrot),
    ],
    get carrying() {
      return state.monkey === 'carrying';
    },
    get taken() {
      return (['carrying', 'completed'] satisfies [string, string]).includes(state.monkey);
    },
    contentNodeId: 'quests.createQuestLog.node-2',
  };
}
export function monkeyQuestDialogue(
  npc: Partial<Actor> | undefined,
  quests: Pick<QuestLog, 'state' | 'carrying'> & {
    accept: () => ActionReceipt | Promise<ActionReceipt>;
    complete: (economy: Economy) => ActionReceipt | Promise<ActionReceipt>;
  },
  economy: Economy,
) {
  const p = {
    ...npc,
    name: MONKEY_QUEST.professor,
    repeat: false,
    decline: contentText('quests.monkeyQuestDialogue.decline-4', {}),
  };
  if (quests.state.monkey === 'completed')
    return {
      ...p,
      intro: contentText('quests.monkeyQuestDialogue.intro-6', {}),
      question: contentText('quests.monkeyQuestDialogue.question-7', {}),
      choice: contentText('quests.monkeyQuestDialogue.choice-8', {}),
      receipt: contentText('quests.monkeyQuestDialogue.receipt-9', {}),
      contentNodeId: 'quests.monkeyQuestDialogue.node-5',
      introTextId: 'quests.monkeyQuestDialogue.intro-6',
      introTextValues: {},
      questionTextId: 'quests.monkeyQuestDialogue.question-7',
      questionTextValues: {},
      choiceTextId: 'quests.monkeyQuestDialogue.choice-8',
      choiceTextValues: {},
      receiptTextId: 'quests.monkeyQuestDialogue.receipt-9',
      receiptTextValues: {},
    };
  if (quests.carrying)
    return {
      ...p,
      intro: contentText('quests.monkeyQuestDialogue.intro-11', {}),
      question: contentText('quests.monkeyQuestDialogue.question-12', {}),
      choice: contentText('quests.monkeyQuestDialogue.choice-13', {}),
      accept: () => quests.complete(economy),
      contentNodeId: 'quests.monkeyQuestDialogue.node-10',
      introTextId: 'quests.monkeyQuestDialogue.intro-11',
      introTextValues: {},
      questionTextId: 'quests.monkeyQuestDialogue.question-12',
      questionTextValues: {},
      choiceTextId: 'quests.monkeyQuestDialogue.choice-13',
      choiceTextValues: {},
      actionId: 'quests.monkeyQuestDialogue.action-14',
    };
  if (quests.state.monkey === 'accepted')
    return {
      ...p,
      intro: contentText('quests.monkeyQuestDialogue.intro-16', {}),
      question: contentText('quests.monkeyQuestDialogue.question-17', {}),
      choice: contentText('quests.monkeyQuestDialogue.choice-18', {}),
      receipt: contentText('quests.monkeyQuestDialogue.receipt-19', {}),
      contentNodeId: 'quests.monkeyQuestDialogue.node-15',
      introTextId: 'quests.monkeyQuestDialogue.intro-16',
      introTextValues: {},
      questionTextId: 'quests.monkeyQuestDialogue.question-17',
      questionTextValues: {},
      choiceTextId: 'quests.monkeyQuestDialogue.choice-18',
      choiceTextValues: {},
      receiptTextId: 'quests.monkeyQuestDialogue.receipt-19',
      receiptTextValues: {},
    };
  return {
    ...p,
    intro: contentText('quests.monkeyQuestDialogue.intro-21', {}),
    question: contentText('quests.monkeyQuestDialogue.question-22', {}),
    choice: contentText('quests.monkeyQuestDialogue.choice-23', {}),
    accept: quests.accept,
    contentNodeId: 'quests.monkeyQuestDialogue.node-20',
    introTextId: 'quests.monkeyQuestDialogue.intro-21',
    introTextValues: {},
    questionTextId: 'quests.monkeyQuestDialogue.question-22',
    questionTextValues: {},
    choiceTextId: 'quests.monkeyQuestDialogue.choice-23',
    choiceTextValues: {},
    actionId: 'quests.monkeyQuestDialogue.action-24',
  };
}
