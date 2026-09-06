import { test, expect } from '@playwright/test';
const base = process.env.TEST_BASE_PATH || '';
const goto = (path: string) => `${base}/${path}`;
test('browse topics and stable historical question versions', async ({ page }) => {
  await page.goto(goto(''));
  await expect(page.getByRole('heading', { name: '问题档案', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '数学', exact: true }).click();
  await expect(page.locator('.question-row:visible')).toHaveCount(1);
  await page.locator('.question-row:visible').click();
  await expect(page.locator('h1')).toBeVisible();
  await page.goto(goto('questions/q-006/revisions/q-006.r1/'));
  await page.getByRole('link', { name: '第 2 版 · 当前' }).click();
  await expect(page.locator('.reading .prose').first()).toContainText('保持上下文');
  await page.goto(goto('answers/a-006-a/'));
  await expect(page.locator('.notice').first()).toContainText('q-006.r1');
});
test('tree focuses deep nodes and separates sibling follow-ups', async ({ page }) => {
  await page.goto(goto('explore/q-001/?focus=q-deeper-1.r1'));
  await expect(page.locator('#tree-reading')).toContainText('怎样判断增加的观测');
  await expect(page.locator('#tree-status')).toBeHidden();
  await expect(page.locator('.tree-row.current')).toHaveAttribute('data-node-id', 'q-deeper-1');
  await page.getByRole('link', { name: '提问原文与版本 ↗', exact: true }).click();
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
  await expect(page.locator('h1')).toBeVisible();
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

test('question opens a visible branch diagram with answers and follow-ups, with a compact directory option', async ({
  page,
}) => {
  await page.goto(goto('questions/q-001/'));
  await expect(page.locator('#branch-graph')).toBeVisible();
  await expect(page.locator('#tree-a-001-a')).toBeVisible();
  await expect(page.locator('#tree-q-follow-1')).toBeAttached();
  await expect(page.locator('#tree-q-001\\.r1')).toHaveCount(0);
  await expect(page.locator('#view-graph')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '树目录', exact: true }).click();
  await expect(page.locator('#tree-list')).toBeVisible();
  await expect(page.locator('#branch-graph')).toBeHidden();
  await page.locator('#tree-a-001-a a').click();
  await expect(page).toHaveURL(/focus=a-001-a/);
  await expect(page.locator('#tree-reading')).toContainText('来源与完整记录');
  if (test.info().project.name === 'mobile') {
    await expect(page.locator('#tree-panel')).toBeHidden();
    await page.getByRole('button', { name: '查看分支图', exact: true }).click();
    await expect(page.locator('#tree-panel')).toBeVisible();
  }
  await page.goBack();
  await expect(page.locator('.tree-row.current')).toHaveAttribute('data-node-id', 'q-001');
  await page.goForward();
  await expect(page.locator('.tree-row.current')).toHaveAttribute('data-node-id', 'a-001-a');
});

test('comparison returns to the selected historical branch and contribution names its target', async ({
  page,
}) => {
  await page.goto(goto('questions/q-006/?focus=a-006-a'));
  await expect(page.locator('#tree-reading')).toContainText('第 1 版');
  await page.getByRole('link', { name: '比较答案', exact: true }).click();
  await expect(page.locator('#compare-app')).toBeVisible();
  await page.getByRole('link', { name: '返回分支图', exact: true }).click();
  await expect(page).toHaveURL(/focus=a-006-a/);
  await expect(page.locator('#tree-reading')).toContainText('来源与完整记录');
  await page.getByRole('link', { name: '＋ 追问这份回答', exact: true }).click();
  await expect(page.locator('#contribution-context')).toContainText('针对这份回答继续追问');
  await expect(page.getByLabel('父答案 ID', { exact: true })).toHaveValue('a-006-a');
  await page.getByRole('link', { name: '返回这条分支', exact: true }).click();
  await expect(page).toHaveURL(/focus=a-006-a/);
});

test('a failed tree request retains static reading and retry through view switches', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/data/trees/*.json', (route) =>
    fail ? route.fulfill({ status: 503, body: '{}' }) : route.continue(),
  );
  await page.goto(goto('questions/q-001/'));
  await expect(page.getByRole('button', { name: '重新加载分支' })).toBeVisible();
  await page.getByRole('button', { name: '树目录', exact: true }).click();
  await expect(page.getByRole('button', { name: '重新加载分支' })).toBeVisible();
  await expect(page.locator('#tree-reading .prose')).toContainText('森林');
  fail = false;
  await page.getByRole('button', { name: '重新加载分支' }).click();
  await expect(page.locator('#tree-a-001-a')).toBeVisible();
});

test('node failure opens the exact record and invalid focus cannot be overwritten by an earlier response', async ({
  page,
}) => {
  await page.route('**/data/nodes/q-001.json', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto(goto('questions/q-001/'));
  await expect(page.getByRole('button', { name: '重新读取' })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开完整记录', exact: true })).toHaveAttribute(
    'href',
    goto('questions/q-001/revisions/q-001.r1/'),
  );
  await page.unroute('**/data/nodes/q-001.json');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/data/nodes/a-001-a.json', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(goto('questions/q-001/?focus=a-001-a'));
  await expect(page.locator('#tree-reading')).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => {
    history.pushState({}, '', '?focus=missing');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('#tree-reading')).toContainText('不属于这棵探索树');
  release();
  await page.waitForTimeout(150);
  await expect(page.locator('#tree-reading')).toContainText('不属于这棵探索树');
  await expect(page.locator('#tree-reading')).not.toHaveAttribute('aria-busy', 'true');
});

test('search answers lead into their branch position', async ({ page }) => {
  await page.goto(goto('search/'));
  await page.locator('#search input').first().fill('森林');
  await expect(page.locator('.pagefind-ui__result-link').first()).toBeVisible();
  const links = await page
    .locator('.pagefind-ui__result-link')
    .evaluateAll((items) => items.map((a) => (a as HTMLAnchorElement).href));
  expect(links.filter((href) => !new URL(href).pathname.includes('/questions/'))).toEqual([]);
  expect(links.some((href) => new URL(href).searchParams.get('focus')?.startsWith('a-'))).toBe(
    true,
  );
});

test('large branches retain the focused path while showing more nodes incrementally', async ({
  page,
}) => {
  await page.route('**/data/trees/q-001.json', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const index = data.nodes.findIndex((n: any) => n.id === 'a-001-a');
    const original = data.nodes[index];
    data.nodes.splice(
      index,
      0,
      ...Array.from({ length: 220 }, (_, i) => ({
        ...original,
        id: `capacity-answer-${i}`,
        label: `回答 ${i + 1}`,
      })),
    );
    await route.fulfill({ response, json: data });
  });
  await page.goto(goto('questions/q-001/?focus=a-001-a'));
  await expect(page.locator('#tree-reading')).toContainText('来源与完整记录');
  await expect(page.locator('.tree-row')).toHaveCount(100);
  await expect(page.locator('#tree-a-001-a')).toBeInViewport();
  await page.getByRole('button', { name: /显示更多节点/ }).click();
  await expect(page.locator('.tree-row')).toHaveCount(200);
  await expect(page.locator('.tree-row.current')).toHaveAttribute('data-node-id', 'a-001-a');
});
