import { git } from '../pr-gate/git.mjs';
import { listMergedPullRequests } from '../pr-gate/github.mjs';
import { parsePrTitle, SLUG_REGEX } from '../pr-gate/title.mjs';

export async function findAcceptedCourseworks({
  root,
  repository,
  token,
  pullLookup = listMergedPullRequests,
}) {
  const pulls = await pullLookup(repository, token);
  const history = new Set(git(['rev-list', 'HEAD'], root).split('\n'));
  const accepted = new Map();
  for (const pull of [...pulls].sort((left, right) =>
    String(left.merged_at).localeCompare(String(right.merged_at)),
  )) {
    if (!pull.merged_at || !history.has(pull.merge_commit_sha)) {
      continue;
    }
    let title;
    try {
      title = parsePrTitle(pull.title);
    } catch {
      continue;
    }
    if (title.kind !== 'coursework') {
      continue;
    }
    const login = pull.user?.login;
    if (!login) {
      throw new Error(`Cannot determine the author of merged coursework PR #${pull.number}.`);
    }
    const key = login.toLowerCase();
    if (accepted.has(key)) {
      continue;
    }
    // A name in the title is only a display hint; the PR author owns the submission.
    const candidate = pull.title.trim().split(/\s+/).at(-1);
    accepted.set(key, {
      login,
      slug: SLUG_REGEX.test(candidate) ? candidate : null,
      acceptedAt: pull.merged_at,
      pullNumber: pull.number,
      url: `https://github.com/${repository}/pull/${pull.number}`,
    });
  }
  return [...accepted.values()];
}

export function attachCourseworks(students, courseworks) {
  for (const student of students) {
    student.coursework = { accepted: false, acceptedAt: null, pullNumber: null, url: null };
    student.acceptedTotal = student.acceptedCount;
  }
  for (const coursework of courseworks) {
    const matches = students.filter(
      (student) => student.github?.toLowerCase() === coursework.login.toLowerCase(),
    );
    let student = matches.find((candidate) => candidate.slug === coursework.slug);
    if (!student && matches.length === 1) {
      [student] = matches;
    }
    if (!student && matches.length === 0 && coursework.slug) {
      student = students.find(
        (candidate) =>
          candidate.slug === coursework.slug && !candidate.github && candidate.acceptedCount === 0,
      );
    }
    if (!student) {
      student = {
        acceptedCount: 0,
        errors:
          matches.length > 1
            ? ['coursework: multiple student directories belong to this GitHub author']
            : [],
        github: coursework.login,
        labs: Object.fromEntries(
          [1, 2, 3, 4, 5].map((lab) => [
            `lab${lab}`,
            { accepted: false, acceptedAt: null, variant: null },
          ]),
        ),
        slug: null,
        variant: null,
      };
      students.push(student);
    }
    student.github ??= coursework.login;
    student.coursework = {
      accepted: true,
      acceptedAt: coursework.acceptedAt,
      pullNumber: coursework.pullNumber,
      url: coursework.url,
    };
    student.acceptedTotal = student.acceptedCount + 1;
  }
  students.sort((left, right) =>
    (left.slug ?? left.github).localeCompare(right.slug ?? right.github, 'en'),
  );
}
