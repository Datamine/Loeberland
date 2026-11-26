import { editedSpeechText } from '../world-edits.ts';
import { contentText } from '../content-runtime.ts';
/** Conversation copy belongs in the dialogue menu. Only player chat and
 * explicitly marked event/animal cues may render above an actor's head. */
export function actorSpeechText(
  actor: Partial<import('../types/scene-state.ts').ActorTag>,
  time: number,
  serverTime = Date.now(),
) {
  if (serverTime < (actor.helpUntil || 0)) return contentText('world-message.civilian.help');
  if (actor.speechCue && time < actor.speechCue.until) return actor.speechCue.text;
  if (!actor.player && !actor.police && !actor.chasing && !actor.speechBubble) return '';
  return time < (actor.speechUntil || 0) ? editedSpeechText(actor, actor.speech || '') : '';
}
