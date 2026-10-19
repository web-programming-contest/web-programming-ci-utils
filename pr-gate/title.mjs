export const SLUG_PATTERN = '[a-z]+(?:-[a-z]+)*\\.[a-z]+(?:-[a-z]+)*';
export const SLUG_REGEX = new RegExp(`^${SLUG_PATTERN}$`);

const titlePattern = new RegExp(`^\\[TASK-([1-5])\\] variant_([1-9][0-9]*) (${SLUG_PATTERN})$`);

export function parsePrTitle(title) {
  if (/^\[(?:COURSEWORK|COURSE_WORK)\](?: .*)?$/.test(title)) {
    return { kind: 'coursework' };
  }
  const match = titlePattern.exec(title);
  if (!match) {
    throw new Error(
      'PR title must match "[TASK-N] variant_K surname.name" (N: 1..5, K: positive integer, lowercase Latin name), or start with "[COURSEWORK]" / "[COURSE_WORK]".',
    );
  }

  return { lab: Number(match[1]), slug: match[3], variant: Number(match[2]) };
}
