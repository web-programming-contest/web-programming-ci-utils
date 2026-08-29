import assert from 'node:assert/strict';

const responsiveKinds = new Set(['responsive-columns', 'responsive-image-grid', 'responsive-nav']);

export function getResponsiveValidator(kind) {
  return responsiveKinds.has(kind) ? validateResponsiveRule : undefined;
}

async function validateResponsiveRule(page, contract) {
  const snapshots = [];
  for (const viewport of contract.viewports) {
    await page.setViewportSize({ height: 720, width: viewport.width });
    await page.reload({ waitUntil: 'networkidle' });
    snapshots.push(
      await page.locator(contract.selector).evaluateAll((elements) => {
        const rects = elements
          .map((item) => item.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0);
        return {
          columns: new Set(rects.map((rect) => Math.round(rect.left))).size,
          count: rects.length,
        };
      }),
    );
  }

  for (const [index, viewport] of contract.viewports.entries()) {
    const snapshot = snapshots[index];
    assert.ok(
      snapshot.count >= contract.minCount,
      `${contract.name}: too few elements at ${viewport.width}px`,
    );
    if (viewport.columns !== undefined) {
      assert.equal(
        snapshot.columns,
        viewport.columns,
        `${contract.name}: columns at ${viewport.width}px`,
      );
    }
    if (viewport.minColumns !== undefined) {
      assert.ok(
        snapshot.columns >= viewport.minColumns,
        `${contract.name}: too few columns at ${viewport.width}px`,
      );
    }
    if (viewport.maxColumns !== undefined) {
      assert.ok(
        snapshot.columns <= viewport.maxColumns,
        `${contract.name}: too many columns at ${viewport.width}px`,
      );
    }
  }
  if (contract.requireDecrease) {
    assert.ok(
      snapshots[0].columns > snapshots.at(-1).columns,
      `${contract.name}: desktop must have more columns`,
    );
  }
}
