import path from 'node:path';
import { writeBrowserReport } from './browser-html.mjs';

export async function saveBrowserArtifacts({ context, page, passed, resultsDirectory, result }) {
  await page.screenshot({
    fullPage: true,
    path: path.join(resultsDirectory, passed ? 'page.png' : 'failure.png'),
  });
  await writeBrowserReport(resultsDirectory, result);

  if (passed) {
    return false;
  }

  await context.tracing.stop({ path: path.join(resultsDirectory, 'trace.zip') });
  return true;
}
