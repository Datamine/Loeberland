import test from 'node:test';
import assert from 'node:assert/strict';
import { actorSpeechText } from '../src/rendering/actor-labels.ts';

test('ordinary pedestrian speech never becomes an overhead bubble, including stale timed lines', () => {
  for (const person of [
    { label: 'Man' },
    { label: 'Woman', female: true },
    { label: 'Neighbor', neighborhood: true },
    { label: 'Resident', estateResident: true },
    { label: 'Diner', club: true },
    { label: 'Dog walker', dogWalker: true },
  ]) {
    assert.equal(
      actorSpeechText(
        { ...person, speech: 'Use the conversation menu.', speechUntil: Infinity },
        100,
      ),
      '',
    );
  }
});

test('player chat and explicit event cues retain their text only while active', () => {
  for (const actor of [
    { player: true },
    { police: true },
    { chasing: true },
    { speechBubble: true },
  ]) {
    const cue = { ...actor, speech: 'An active cue', speechUntil: 200 };
    assert.equal(actorSpeechText(cue, 100), 'An active cue');
    assert.equal(actorSpeechText(cue, 200), '');
    assert.equal(actorSpeechText(cue, 300), '');
  }
  assert.equal(actorSpeechText({ player: true, speechUntil: 200 }, 100), '');
});

test('a civilian calls for help until the server deadline', () => {
  const victim = { helpUntil: 104500, speech: 'Good morning.', speechUntil: 1000 };
  assert.equal(actorSpeechText(victim, 150, 100200), 'Help!');
  assert.equal(actorSpeechText(victim, 160, 104500), '');
});
