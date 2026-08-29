import { pullRequestsForCommit } from './github.mjs';
import { git } from './git.mjs';
import { parsePrTitle } from './title.mjs';

export async function findStudentBinding({ baseRoot, repository, slug, token, pullLookup }) {
  const commitsOutput = git(['log', '--reverse', '--format=%H', '--', slug], baseRoot);
  if (!commitsOutput) {
    return null;
  }

  for (const commit of commitsOutput.split('\n').filter(Boolean)) {
    const pullRequests = await (pullLookup ?? pullRequestsForCommit)(repository, commit, token);
    for (const pullRequest of pullRequests.filter((candidate) => candidate.merged_at)) {
      let title;
      try {
        title = parsePrTitle(pullRequest.title);
      } catch {
        continue;
      }
      if (title.slug !== slug) {
        continue;
      }
      if (!pullRequest.user?.login) {
        throw new Error(
          `Cannot determine the merged PR author for the first accepted commit ${commit}.`,
        );
      }
      return {
        commit,
        lab: title.lab,
        login: pullRequest.user.login,
        pullNumber: pullRequest.number,
        variant: title.variant,
      };
    }
  }

  throw new Error(
    `Directory ${slug} already exists in course history, but its first accepted PR with a valid title cannot be determined.`,
  );
}
