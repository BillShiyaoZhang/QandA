import { test, expect } from '@playwright/test';
const base = process.env.TEST_BASE_PATH || '';
const goto = (path: string) => `${base}/${path}`;
test('browse topics and stable historical question versions', async ({ page }) => {
  await page.goto(goto(''));
  await expect(page.getByRole('heading', { name: '问题档案', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '数学', exact: true }).click();
  await expect(page.locator('.question-row:visible')).toHaveCount(1);
  await page.locator('.question-row:visible').click();
  await expect(
    page.getByRole('heading', { name: '0.999…为什么等于1？', exact: true }),
  ).toBeVisible();
  await page.goto(goto('questions/q-006/revisions/q-006.r1/'));
  await page.getByRole('link', { name: 'r2 · 当前' }).click();
  await expect(page.locator('.reading .prose').first()).toContainText('保持上下文');
  await page.goto(goto('answers/a-006-a/'));
  await expect(page.locator('.notice').first()).toContainText('q-006.r1');
});
test('tree focuses deep nodes and separates sibling follow-ups', async ({ page }) => {
  await page.goto(goto('explore/q-001/?focus=q-deeper-1.r1'));
  await expect(page.locator('#tree-reading')).toContainText('怎样判断增加的观测');
  await expect(page.locator('#tree-status')).toBeHidden();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: '查看分支目录' }).click();
  await expect(page.locator('.tree-row.current')).toContainText('r1');
  await page.getByRole('link', { name: '打开完整记录' }).click();
  await expect(page).toHaveURL(/q-deeper-1/);
  await page.goto(goto('answers/a-001-b/'));
  await expect(page.getByText('还没有追问。')).toBeVisible();
  await page.goto(goto('answers/a-001-a/'));
  await expect(page.getByRole('link', { name: /只留下文字描述/ })).toBeVisible();
});
test('copy path excludes sibling answers and keeps historical versions', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(goto('answers/a-deeper-4/'));
  await page.getByRole('button', { name: '复制当前路径', exact: true }).click();
  await expect(page.getByRole('button', { name: '已复制', exact: true })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('q-006.r1');
  expect(text).not.toContain('q-006.r2');
  expect(text).not.toContain('a-006-b');
});
test('comparison works and exposes unknown conditions', async ({ page }) => {
  await page.goto(goto('compare/?left=a-001-a&right=a-001-b'));
  await expect(page.locator('#compare-app')).toBeVisible();
  await expect(page.locator('#conditions')).toContainText('生成时间未知');
  await page.getByLabel('比较方式').selectOption('conditions');
  await expect(page.locator('#condition-notice')).toContainText('无法认定条件对齐');
  if (test.info().project.name === 'mobile') {
    await page.getByRole('tab', { name: '答案 B' }).click();
    await expect(page.locator('#pane-right')).toBeVisible();
    await expect(page.locator('#pane-left')).toBeHidden();
  }
  await page.goto(goto('compare/?left=a-006-a&right=a-006-new'));
  await expect(page.locator('#condition-notice')).toContainText('不同的问题修订');
});
test('Chinese search loads real Pagefind index', async ({ page }) => {
  await page.goto(goto('search/'));
  const input = page.locator('#search input').first();
  await expect(input).toBeVisible();
  await input.fill('森林');
  await expect(page.locator('.pagefind-ui__result').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.pagefind-ui__results')).toContainText('森林');
});
test('contribution handoff contains only template and stable identifiers', async ({ page }) => {
  let requested = '';
  await page.route('https://github.com/**', (route) => {
    requested = route.request().url();
    return route.fulfill({ status: 200, body: 'GitHub handoff intercepted by test' });
  });
  await page.goto(goto('contribute/?kind=follow-up&parent=a-001-a'));
  await expect(page.getByLabel('父答案 ID', { exact: true })).toHaveValue('a-001-a');
  await page.locator('#public-consent').check();
  await page.getByRole('button', { name: '打开 GitHub 投稿表单' }).click();
  await expect.poll(() => requested).toContain('template=follow-up.yml');
  expect(new URL(requested).searchParams.get('parent_answer_id')).toBe('a-001-a');
  expect(new URL(requested).searchParams.has('body')).toBe(false);
});
test('relation graph links across branches and preserves actual parent path', async ({ page }) => {
  await page.goto(goto('questions/q-001/revisions/q-001.r1/'));
  await page.getByText('查看局部关联图', { exact: true }).click();
  await expect(page.locator('svg.relation-svg')).toBeVisible();
  await expect(page.locator('svg.relation-svg > rect')).toHaveCount(1);
  await expect(page.locator('svg.relation-svg marker')).toHaveCount(1);
  await page.locator('.relation-card a').first().click();
  await expect(page).toHaveURL(/q-003/);
  await expect(page.locator('h1')).toContainText('地图');
  await expect(page.getByRole('link', { name: /返回刚才的节点/ })).toBeVisible();
});
test('core pages have no horizontal overflow or runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const path of [
    '',
    'questions/q-001/',
    'answers/a-001-a/',
    'compare/?left=a-001-a&right=a-001-b',
    'explore/q-001/?focus=a-follow-1',
    'contribute/',
  ]) {
    await page.goto(goto(path));
    await page.waitForTimeout(150);
    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
  }
  expect(errors).toEqual([]);
  await page.goto(goto(''));
  await page.screenshot({
    path: `${process.env.TEST_ARTIFACT_DIR || '.local'}/home-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('ordinary reading remains usable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173' + goto('questions/q-001/'));
  await expect(
    page.getByRole('heading', {
      name: '如果森林的声音被完整录下，能重建那片森林吗？',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: '阅读全文 →' }).first().click();
  await expect(page.locator('.prose').first()).toBeVisible();
  await context.close();
});

test('comparison distinguishes complete protocol evidence from equal partial transcripts', async ({
  page,
}) => {
  let complete = false;
  await page.route('**/data/answers/*.json', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.answer.generation.protocol = 'Test-only recorded rules';
    data.answer.generation.parameters = { temperature: 0 };
    data.answer.generation.tools = 'none';
    data.answer.context.visible_history_completeness = complete ? 'complete' : 'partial';
    data.context_label = complete ? '提交者提供完整可见历史' : '只提供部分上下文';
    data.snapshot = {
      id: 'test-only-context',
      sha256: 'test-only',
      messages: [{ role: 'user', content: data.revision.text }],
      path_refs: [],
      attachments: [],
    };
    await route.fulfill({ response, json: data });
  });
  await page.goto(goto('compare/?left=a-001-a&right=a-001-b'));
  await expect(page.locator('#compare-app')).toBeVisible();
  await page.getByLabel('比较方式').selectOption('conditions');
  await expect(page.locator('#condition-notice')).toContainText('可见历史未声明完整');
  complete = true;
  await page.reload();
  await expect(page.locator('#compare-app')).toBeVisible();
  await page.getByLabel('比较方式').selectOption('conditions');
  await expect(page.locator('#condition-notice')).toContainText(
    '提交者声明的完整可见输入、生成协议和显式参数一致',
  );
  await expect(page.locator('#conditions')).toContainText('提供方');
});
