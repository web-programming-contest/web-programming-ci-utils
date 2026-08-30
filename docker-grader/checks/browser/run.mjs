#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { saveBrowserArtifacts } from '../../../reports/browser-artifacts.mjs';
import { parseArgs, requiredArg } from '../../../shared/args.mjs';
import { loadBrowserContract } from '../../contracts/store.mjs';
import { createStaticServer } from '../../runtime/static-server.mjs';
import { installDomHelpers } from './dom-helpers.mjs';
import { getLabSuite } from './labs/index.mjs';

export async function checkBrowser({ lab, resultsDirectory, siteDirectory, variant }) {
  await mkdir(resultsDirectory, { recursive: true });
  const contract = await loadBrowserContract(lab, variant);
  const labSuite = getLabSuite(lab);
  const server = createStaticServer(siteDirectory);
  console.log('Starting Chromium...');
  const launchOptions = {
    args: ['--disable-crash-reporter', '--disable-crashpad-for-testing'],
    ...(process.env.COURSE_CHROMIUM_PATH
      ? { executablePath: process.env.COURSE_CHROMIUM_PATH }
      : {}),
  };
  const browser = await chromium.launch(launchOptions);
  console.log('Chromium started.');
  const context = await browser.newContext({
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    viewport: { height: 720, width: 1280 },
  });
  await context.addInitScript(installDomHelpers);
  if (labSuite.initScript) {
    await context.addInitScript(labSuite.initScript);
  }
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(15_000);
  const steps = [];
  let traceSaved = false;
  let diagnostics;

  try {
    const baseUrl = await listen(server);
    diagnostics = monitorPage(page, baseUrl);
    const pageUrl = new URL(contract.common.page, baseUrl).href;
    await runStep(steps, 'Page loads without browser errors', () =>
      checkPageLoad(page, pageUrl, contract.common, diagnostics),
    );
    diagnostics.reset();
    await runStep(steps, 'Layout fits the desktop viewport', () =>
      checkOverflow(page, pageUrl, contract.common),
    );

    const labSteps = await labSuite.createSteps({ contract, page, pageUrl });
    for (const step of labSteps) {
      await runStep(steps, step.name, step.operation);
    }
    await runStep(steps, 'Interactions finish without browser errors', () =>
      diagnostics.assertClean(),
    );

    const passed = steps.every((step) => step.status === 'passed');
    const result = { lab, passed, steps, variant };
    const artifacts = await saveBrowserArtifacts({
      context,
      page,
      passed,
      resultsDirectory,
      result,
    });
    traceSaved = artifacts.traceSaved;
    for (const error of artifacts.errors) {
      console.warn(`Could not save browser diagnostic: ${error}`);
    }
    printSteps(steps);
    if (!passed) {
      throw new Error(
        `${steps.filter((step) => step.status === 'failed').length} browser checks failed.`,
      );
    }
    return result;
  } finally {
    diagnostics?.dispose();
    if (!traceSaved) {
      await context.tracing.stop().catch(() => {});
    }
    await Promise.allSettled([browser.close(), close(server)]);
  }
}

async function checkPageLoad(page, pageUrl, common, diagnostics) {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  assert.ok(await page.locator('body').isVisible(), 'body must be visible');
  assert.match(await page.title(), new RegExp(common.titlePattern), 'page title');
  assert.ok(
    await page.locator(common.meaningfulSelector).first().isVisible(),
    'page must contain visible semantic or interactive UI',
  );
  diagnostics.assertClean();
}

function monitorPage(page, baseUrl) {
  const errors = [];
  const failedResources = [];
  const onConsole = (message) =>
    message.type() === 'error' && errors.push(`console: ${message.text()}`);
  const onPageError = (error) => errors.push(`pageerror: ${error.message}`);
  const onResponse = (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      failedResources.push(`${response.status()} ${response.url()}`);
    }
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  return {
    assertClean() {
      assert.deepStrictEqual(failedResources, [], 'all local resources must load');
      assert.deepStrictEqual(errors, [], 'browser console must not contain errors');
    },
    dispose() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    },
    reset() {
      errors.length = 0;
      failedResources.length = 0;
    },
  };
}

async function checkOverflow(page, pageUrl, common) {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth + common.overflowTolerance,
    `horizontal overflow: scrollWidth=${dimensions.scrollWidth}, clientWidth=${dimensions.clientWidth}`,
  );
}

async function runStep(steps, name, operation) {
  console.log(`\n==> ${name}`);
  try {
    await operation();
    steps.push({ name, status: 'passed' });
    console.log('PASS');
  } catch (error) {
    steps.push({
      error: error instanceof Error ? error.message : String(error),
      name,
      status: 'failed',
    });
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function printSteps(steps) {
  for (const step of steps) {
    console.log(
      `${step.status === 'passed' ? 'PASS' : 'FAIL'} ${step.name}${step.error ? `\n${step.error}` : ''}`,
    );
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  if (!server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve) => server.close(resolve));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await checkBrowser({
    lab: Number(requiredArg(args, 'lab')),
    resultsDirectory: path.resolve(requiredArg(args, 'results')),
    siteDirectory: path.resolve(requiredArg(args, 'site')),
    variant: Number(requiredArg(args, 'variant')),
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(
      `\nBrowser check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
