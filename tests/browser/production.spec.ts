import { test, expect } from '@playwright/test';
import { loadStore, published } from '../../src/lib/content';
const s = loadStore(),
  roots = Object.values(s.questions).filter(
    (q) => !q.parent_answer_id && published(s, 'question', q.id),
  );
const base = process.env.TEST_BASE_PATH || '';
test('production build reflects the real content library and supports an empty archive', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/`);
  await expect(page.locator('.question-row')).toHaveCount(roots.length);
  if (!roots.length) {
    await expect(page.getByRole('heading', { name: '还没有问题', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '提个新问题', exact: true })).toBeVisible();
    await expect(page.getByText('当前内容为开发样例', { exact: false })).toHaveCount(0);
    for (const p of ['questions/q-001/', 'answers/a-001-a/', 'data/nodes/q-001.json'])
      expect((await request.get(`${base}/${p}`)).status()).toBe(404);
    await page.goto(`${base}/search/`);
    await expect(page.locator('#search-status')).toContainText('还没有可搜索的问题');
    await expect(page.locator('#search input')).toHaveCount(0);
  }
  await page.goto(`${base}/contribute/?kind=question`);
  await expect(page.getByRole('heading', { name: '让问题继续', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
