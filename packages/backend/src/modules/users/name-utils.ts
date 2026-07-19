/**
 * Splits a full name into firstName and lastName.
 *
 * Logic:
 * - Trims whitespace from the input
 * - Splits on the FIRST space character only
 * - Everything before the first space is firstName
 * - Everything after the first space is lastName (trimmed)
 * - If no space exists, firstName is the full trimmed string and lastName is ""
 * - If input is empty (or only whitespace), both are ""
 */
export function splitName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = fullName.trim();

  if (trimmed === '') {
    return { firstName: '', lastName: '' };
  }

  const spaceIndex = trimmed.indexOf(' ');

  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: '' };
  }

  const firstName = trimmed.slice(0, spaceIndex);
  const lastName = trimmed.slice(spaceIndex + 1).trim();

  return { firstName, lastName };
}
