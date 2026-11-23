import { createHash } from 'node:crypto';
import { valueAt } from './drafts.ts';
import { sourceValue, setSourceValue } from './project.mts';
import { validateContent } from '../src/content-validation.ts';
import { isRecord, errorMessage } from '../src/types/json.ts';
import type { ContentBundle, TextSpec } from '../src/types/content.ts';
import type { EditorCatalog, BoundRecord } from '../src/types/editor.ts';
function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function placementExamineText(bundle: ContentBundle, spec: TextSpec, template: string): TextSpec {
  if (typeof spec === 'string') return template;
  if ('select' in spec)
    return { ...spec, default: placementExamineText(bundle, spec.default, template) };
  const { bindings } = bundle.texts.texts[spec.text];
  if (!bindings) return template;

  // A new text record preserves substitutions without rewriting any shared template.
  const id =
    'placement.examine.' +
    createHash('sha256').update(JSON.stringify({ template, bindings })).digest('hex');
  bundle.texts.texts[id] = { template, bindings };
  return { text: id };
}

/** Resolve UI fields to canonical ID paths using the server's own catalog. */
export function planEditorWrite(
  catalog: EditorCatalog,
  existing: ContentBundle,
  changes: unknown,
): ContentBundle {
  if (!Array.isArray(changes) || !changes.length || changes.length > 10000)
    fail('Choose between 1 and 10,000 changes to save.');
  const roots = new Map<string, BoundRecord>([
    ...catalog.records.map((r): [string, BoundRecord] => [r.key, r]),
    ...catalog.sharedDialogue.map((r): [string, BoundRecord] => ['shared:' + r.id, r]),
    ...catalog.worldMessages.map((r): [string, BoundRecord] => [r.key, r]),
    ...catalog.labels.map((r): [string, BoundRecord] => [r.key, r]),
    ...catalog.items.map((r): [string, BoundRecord] => [r.key, r]),
  ]);
  const next = structuredClone(existing),
    written = new Map<string, unknown>();
  for (const change of changes as unknown[]) {
    if (
      !isRecord(change) ||
      !Array.isArray(change.path) ||
      !change.path.every((p) => typeof p === 'string' || typeof p === 'number') ||
      typeof change.record !== 'string' ||
      typeof change.after !== 'string' ||
      change.after.length > 16000
    )
      fail('Every change must contain an editable field and text under 16,000 characters.');
    const root = roots.get(change.record),
      binding = root?.bindings[JSON.stringify(change.path)];
    if (!root || !binding) fail('Unknown editable content field.');
    if (
      change.before !== valueAt(root, change.path) ||
      JSON.stringify(sourceValue(existing, binding.file, binding.path)) !==
        JSON.stringify(binding.value)
    )
      fail('Content changed. Reload the editor before saving.', 409);
    let value: unknown = change.after;
    if (binding.kind === 'number') {
      value = Number(change.after);
      if (!change.after.trim() || !Number.isFinite(value)) fail('Enter a finite number.');
    }
    if (binding.kind === 'condition') {
      try {
        value = JSON.parse(change.after);
        if (value === true) value = undefined;
      } catch {
        fail('Conditions must be valid JSON.');
      }
    }
    const placement = Object.hasOwn(existing.entities.placements, change.record)
      ? existing.entities.placements[change.record]
      : undefined;
    const placementExamine =
      placement && change.path.length === 1 && change.path[0] === 'description';
    const file = placementExamine ? 'entities' : binding.file;
    const path = placementExamine ? ['placements', placement.id, 'description'] : binding.path;
    const key = JSON.stringify([file, path]);
    if (written.has(key) && JSON.stringify(written.get(key)) !== JSON.stringify(value))
      fail('Two edits disagree about the same shared definition field.');
    written.set(key, value);
    if (placementExamine) {
      const spec =
        placement.description ?? existing.entities.definitions[placement.definition].description;
      value = placementExamineText(next, spec, change.after);
    }
    setSourceValue(next, file, path, value);
  }
  try {
    return validateContent(next);
  } catch (error) {
    fail(errorMessage(error));
  }
}
