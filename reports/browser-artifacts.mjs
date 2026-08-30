import path from 'node:path';
import { writeBrowserReport } from './browser-html.mjs';

export async function saveBrowserArtifacts({ context, page, passed, resultsDirectory, result }) {
  const errors = [];
  await capture(errors, () =>
    page.screenshot({
      fullPage: true,
      path: path.join(resultsDirectory, passed ? 'page.png' : 'failure.png'),
    }),
  );
  await capture(errors, () => writeBrowserReport(resultsDirectory, result));

  if (passed) {
    return { errors, traceSaved: false };
  }

  let traceSaved = false;
  await capture(errors, async () => {
    await context.tracing.stop({ path: path.join(resultsDirectory, 'trace.zip') });
    traceSaved = true;
  });
  return { errors, traceSaved };
}

async function capture(errors, operation) {
  try {
    await operation();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}
