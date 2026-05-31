import type { FormField, ChangeDetectionResult } from './form.types.js';

/**
 * Detect changes between two sets of form fields.
 *
 * Structural change = any of: field added, field removed, field type changed
 * Aesthetic change = only CSS/style changes, label text changes, placeholder changes, help text, visual order
 */
export function detectChanges(
  oldFields: FormField[],
  newFields: FormField[],
): ChangeDetectionResult {
  const oldMap = new Map<string, FormField>();
  const newMap = new Map<string, FormField>();

  for (const field of oldFields) {
    oldMap.set(field.name, field);
  }

  for (const field of newFields) {
    newMap.set(field.name, field);
  }

  const addedFields: string[] = [];
  const removedFields: string[] = [];
  const typeChangedFields: string[] = [];
  const renamedFields: { old: string; new: string }[] = [];

  // Fields in new but not in old = added (structural)
  for (const name of newMap.keys()) {
    if (!oldMap.has(name)) {
      addedFields.push(name);
    }
  }

  // Fields in old but not in new = removed (structural)
  for (const name of oldMap.keys()) {
    if (!newMap.has(name)) {
      removedFields.push(name);
    }
  }

  // Fields in both but with different type = type changed (structural)
  for (const [name, newField] of newMap.entries()) {
    const oldField = oldMap.get(name);
    if (oldField && oldField.type !== newField.type) {
      typeChangedFields.push(name);
    }
  }

  // Detect potential renames: if a field was removed and another added with same type,
  // it might be a rename. We use a heuristic: same type and same position.
  if (addedFields.length > 0 && removedFields.length > 0) {
    const oldFieldsList = oldFields.filter((f) => removedFields.includes(f.name));
    const newFieldsList = newFields.filter((f) => addedFields.includes(f.name));

    for (const oldField of oldFieldsList) {
      for (const newField of newFieldsList) {
        if (
          oldField.type === newField.type &&
          !renamedFields.some((r) => r.old === oldField.name || r.new === newField.name)
        ) {
          renamedFields.push({ old: oldField.name, new: newField.name });
          break;
        }
      }
    }
  }

  // Determine if structural or aesthetic
  const isStructural =
    addedFields.length > 0 ||
    removedFields.length > 0 ||
    renamedFields.length > 0 ||
    typeChangedFields.length > 0;

  return {
    type: isStructural ? 'structural' : 'aesthetic',
    addedFields,
    removedFields,
    renamedFields,
    typeChangedFields,
  };
}
