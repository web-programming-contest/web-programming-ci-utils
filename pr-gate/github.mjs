const requestTimeoutMs = 15_000;

export async function githubRequest(url, token = process.env.GITHUB_TOKEN) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'web-programming-course-grader',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) {
    const rateLimit = response.headers.get('x-ratelimit-remaining');
    const suffix = rateLimit === '0' ? ' GitHub API rate limit is exhausted.' : '';
    throw new Error(`GitHub API ${response.status} for ${url}.${suffix}`);
  }
  return response.json();
}

export async function listPullRequestFiles(apiUrl, token = process.env.GITHUB_TOKEN) {
  const files = [];
  for (let page = 1; ; page += 1) {
    const separator = apiUrl.includes('?') ? '&' : '?';
    const batch = await githubRequest(
      `${apiUrl}/files${separator}per_page=100&page=${page}`,
      token,
    );
    files.push(...batch);
    if (batch.length < 100) {
      return files;
    }
  }
}

export async function pullRequestsForCommit(repository, sha, token = process.env.GITHUB_TOKEN) {
  return githubRequest(`https://api.github.com/repos/${repository}/commits/${sha}/pulls`, token);
}
