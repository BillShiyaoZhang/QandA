import { test, expect } from '@playwright/test';
test.skip(!process.env.BENCHMARK_BROWSER, 'capacity fixture only');
const base = process.env.TEST_BASE_PATH || '';
test('twenty-level focus renders a bounded directory on desktop and mobile', async ({ page, context }) => {
  await page.goto(`${base}/explore/bench-q-0/?focus=bench-a-20-0`);
  await expect(page.locator('#tree-reading')).toContainText('容量测试问题 20');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: '查看分支目录' }).click();
  await expect(page.locator('.tree-row.current')).toContainText('bench-a-20-0');
  expect(await page.locator('.tree-row').count()).toBeLessThanOrEqual(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    (await page.evaluate(() => document.documentElement.clientWidth)) + 1,
  );
  await page.getByRole('link', { name: '打开完整记录' }).click();
  await expect(page.locator('h1')).toContainText('容量测试问题 20');
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.getByRole('button',{name:'复制当前路径',exact:true}).click();
  await expect(page.getByRole('button',{name:'已复制',exact:true})).toBeVisible();
  const copied=await page.evaluate(()=>navigator.clipboard.readText());
  expect(copied.match(/^## (?:提问|回答) \[bench-[\w-]+\]$/gm)).toHaveLength(42);
  expect(copied).toContain('bench-r-0');
  expect(copied).toContain('bench-a-19-0');
  expect(copied).not.toContain('bench-a-19-1');
});
