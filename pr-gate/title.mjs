export const SLUG_PATTERN = '[a-z]+(?:-[a-z]+)*\\.[a-z]+(?:-[a-z]+)*';
export const SLUG_REGEX = new RegExp(`^${SLUG_PATTERN}$`);

const titlePattern = new RegExp(`^\\[TASK-([1-5])\\] variant_([1-9][0-9]*) (${SLUG_PATTERN})$`);

export function parsePrTitle(title) {
  const match = titlePattern.exec(title);
  if (!match) {
    throw new Error(
      'PR title must exactly match "[TASK-N] variant_K surname.name", where N is 1..5, K is a positive integer and the name is lowercase Latin.',
    );
  }

  return { lab: Number(match[1]), slug: match[3], variant: Number(match[2]) };
}
