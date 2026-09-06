import { projectTree, type ExplorationNode } from '../lib/exploration';
import { compareGenerationTime } from '../lib/generation';
import type { nodeDetail } from '../lib/view';
type Detail = NonNullable<ReturnType<typeof nodeDetail>> & {
  url: string;
  copy: { text: string; complete: boolean };
};
const host = document.getElementById('explorer')!;
const root = host.dataset.root!,
  initial = host.dataset.initial!,
  base = host.dataset.base!;
const list = document.getElementById('tree-list')!;
const graph = document.getElementById('branch-graph')!;
const reader = document.getElementById('tree-reading')!;
const status = document.getElementById('tree-status')!;
const more = document.getElementById('more-nodes') as HTMLButtonElement;
const panel = document.getElementById('tree-panel')!;
const mobileToggle = document.getElementById('mobile-tree')!;
let source = new Map<string, ExplorationNode>();
let map = new Map<string, ExplorationNode>();
let aliases = new Map<string, string>();
const children = new Map<string, ExplorationNode[]>();
let expanded = new Set<string>(),
  focus = initial,
  limit = 100,
  request = 0;
let view: 'graph' | 'list' = 'graph';
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
function link(text: string, href: string, cls = 'button small') {
  const a = el('a', text, cls);
  a.href = href;
  return a;
}
function focusUrl(id: string) {
  const url = new URL(location.href);
  url.searchParams.set('focus', id);
  return url.pathname + url.search + url.hash;
}
function nodeLink(text: string, id: string, cls = 'recent-item') {
  const a = link(text, focusUrl(id), cls);
  a.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    void select(id, true);
  });
  return a;
}
const visualId = (id: string) => aliases.get(id) || id;
function expandPath(id: string) {
  let node = map.get(visualId(id));
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    expanded.add(node.id);
    node = node.parent ? map.get(node.parent) : undefined;
  }
}
function mobileOpen(open: boolean) {
  panel.classList.toggle('mobile-open', open);
  mobileToggle.setAttribute('aria-expanded', String(open));
  mobileToggle.textContent = open ? '收起分支图' : '查看分支图';
}
function showReader() {
  if (matchMedia('(max-width:700px)').matches) {
    mobileOpen(false);
    reader.scrollIntoView({ block: 'start' });
  }
  reader.focus({ preventScroll: true });
}
function renderTree() {
  panel.style.maxHeight = matchMedia('(max-width:700px)').matches
    ? ''
    : `${Math.max(260, window.innerHeight - Math.max(20, panel.getBoundingClientRect().top) - 20)}px`;
  list.replaceChildren();
  graph.replaceChildren();
  list.hidden = view !== 'list';
  graph.hidden = view !== 'graph';
  const flattened: { node: ExplorationNode; depth: number }[] = [];
  const stack = (children.get('') || []).map((node) => ({ node, depth: 0 })).reverse();
  while (stack.length) {
    const item = stack.pop()!;
    flattened.push(item);
    if (expanded.has(item.node.id))
      for (const node of [...(children.get(item.node.id) || [])].reverse())
        stack.push({ node, depth: item.depth + 1 });
  }
  let visible = flattened.slice(0, limit);
  if (flattened.findIndex(({ node }) => node.id === visualId(focus)) >= limit) {
    const ancestors = new Set<string>();
    let node = map.get(visualId(focus));
    while (node) {
      ancestors.add(node.id);
      node = node.parent ? map.get(node.parent) : undefined;
    }
    const required = flattened.filter(({ node }) => ancestors.has(node.id)).slice(-limit);
    const extra = flattened
      .filter(({ node }) => !ancestors.has(node.id))
      .slice(0, limit - required.length);
    const included = new Set([...required, ...extra].map(({ node }) => node.id));
    visible = flattened.filter(({ node }) => included.has(node.id));
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('branch-connections');
  svg.style.height = `${visible.length * 120}px`;
  const positions = new Map(
    visible.map(({ node, depth }, index) => [
      node.id,
      { x: 12 + Math.min(depth, 5) * 22, y: index * 120 + 8 },
    ]),
  );
  if (view === 'graph') {
    graph.style.height = `${visible.length * 120 + 12}px`;
    graph.append(svg);
  }
  for (const { node: n, depth } of visible) {
    const current = n.id === visualId(focus);
    const has = (children.get(n.id) || []).length > 0;
    const row = el(
      'div',
      undefined,
      `tree-row ${n.kind}${current ? ' current' : ''}${view === 'graph' ? ' branch-node' : ''}`,
    );
    row.id = `tree-${n.id}`;
    row.dataset.nodeId = n.id;
    const kind =
      n.kind === 'answer'
        ? '回答'
        : n.kind === 'revision'
          ? '版本'
          : n.parent
            ? '追问'
            : '起始问题';
    const a = nodeLink(n.withdrawn ? '内容已撤回' : n.label, n.id, 'branch-link');
    a.title = n.withdrawn ? '内容已撤回' : [n.label, n.summary].filter(Boolean).join(' · ');
    if (current) a.setAttribute('aria-current', 'true');
    const badge = el('span', `${kind}${current ? ' · 当前阅读' : ''}`, 'tree-kind');
    const toggle = el('button', has ? (expanded.has(n.id) ? '−' : '+') : '·');
    toggle.disabled = !has;
    if (has) {
      toggle.setAttribute('aria-expanded', String(expanded.has(n.id)));
      toggle.setAttribute('aria-label', `${expanded.has(n.id) ? '收起' : '展开'} ${n.label}`);
      toggle.addEventListener('click', () => {
        const wasOpen = expanded.has(n.id);
        wasOpen ? expanded.delete(n.id) : expanded.add(n.id);
        renderTree();
        document
          .getElementById(`tree-${n.id}`)
          ?.querySelector('button')
          ?.focus({ preventScroll: true });
      });
    }
    if (view === 'graph') {
      const pos = positions.get(n.id)!;
      row.style.left = `${pos.x}px`;
      row.style.top = `${pos.y}px`;
      const text = el('div', undefined, 'branch-copy');
      text.append(badge, a);
      text.append(
        el(
          'span',
          n.withdrawn
            ? '保留历史位置'
            : n.kind === 'answer'
              ? n.summary || n.date
              : `${(children.get(n.id) || []).length} 个直接分支`,
          'branch-summary',
        ),
      );
      row.append(text, toggle);
      graph.append(row);
      const parent = n.parent ? positions.get(n.parent) : undefined;
      if (parent) {
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('d', `M ${parent.x + 10} ${parent.y + 98} V ${pos.y + 49} H ${pos.x}`);
        svg.append(path);
      }
    } else {
      row.style.paddingLeft = `${6 + Math.min(depth, 5) * 12}px`;
      const text = el('div', undefined, 'branch-copy');
      text.append(a);
      if (n.kind === 'answer')
        text.append(el('span', n.withdrawn ? '已撤回' : n.summary, 'branch-summary'));
      row.append(toggle, badge, text);
      const li = el('li');
      li.append(row);
      list.append(li);
    }
  }
  more.hidden = flattened.length <= visible.length;
  more.textContent = `显示更多节点（已显示 ${visible.length} / ${flattened.length}）`;
  if (source.size) status.hidden = true;
}
function richText(html: string) {
  const body = el('div', undefined, 'prose');
  body.innerHTML = html;
  return body;
}
function renderDetail(d: Detail) {
  reader.replaceChildren();
  const crumbs = el('nav', undefined, 'breadcrumb');
  crumbs.setAttribute('aria-label', '当前探索路径');
  for (const entry of d.path.length > 1 ? d.path : []) {
    const n = source.get(entry.id);
    if (!n) continue;
    const question = n.kind === 'revision' && n.parent ? source.get(n.parent) : undefined;
    if (crumbs.childElementCount) crumbs.append(el('span', '›'));
    crumbs.append(
      nodeLink(question ? `${question.label} · ${n.label}` : n.label, n.id, 'path-link'),
    );
  }
  reader.append(
    crumbs,
    el('div', d.answer ? '答案记录' : d.question.parent_answer_id ? '追问' : '起始问题', 'eyebrow'),
    el('h2', !d.answer && d.question.id === root ? '提问原文' : d.question.title),
  );
  if (d.archived)
    reader.append(el('p', '本分支已归档，保留阅读，暂不接收新内容。', 'notice warning'));
  if (d.revisions.length > 1) {
    const versions = el('div', undefined, 'toolbar');
    versions.setAttribute('aria-label', '问题版本');
    versions.append(el('span', d.answer ? '回答依据：' : '提问版本：', 'small-text'));
    for (const version of d.revisions) {
      const a = nodeLink(
        `${version.label}${version.current ? ' · 当前' : ''}${version.withdrawn ? ' · 已撤回' : ''}`,
        version.id,
        `pill-link${version.id === d.revision?.id ? ' active' : ''}`,
      );
      if (version.id === d.revision?.id) a.setAttribute('aria-current', 'true');
      versions.append(a);
    }
    reader.append(versions);
  }
  if (d.answer) {
    const self = d.answers.find((a) => a.id === d.id)!;
    reader.append(
      el(
        'p',
        `${self?.name || '模型未知'} · ${self?.date || '生成时间未知'} · ${self?.context || '生成上下文未知'}`,
        'muted small-text',
      ),
    );
    if (d.revision) reader.append(nodeLink('查看这份回答对应的提问', d.revision.id, 'small-text'));
  }
  if (d.withdrawn)
    reader.append(el('p', '此内容已撤回，位置保留以便继续阅读后续追问。', 'notice warning'));
  else reader.append(richText(d.html));
  const actions = el('div', undefined, 'actions');
  if (!d.archived && !d.withdrawn && d.revision)
    actions.append(
      link(
        d.answer ? '＋ 追问这份回答' : '提交本题答案',
        d.answer
          ? `${base}contribute/?kind=follow-up&parent=${d.id}`
          : `${base}contribute/?kind=answer&revision=${d.revision.id}`,
        'button small primary',
      ),
    );
  actions.append(link(d.answer ? '来源与完整记录 ↗' : '提问原文与版本 ↗', d.url));
  const available = [...d.comparisonAnswers].sort(
    (a, b) => Number(b.revision === d.revision?.id) - Number(a.revision === d.revision?.id),
  );
  if (available.length >= 2) {
    const left = d.answer && !d.withdrawn ? d.id : available[0].id;
    const right = available.find((a) => a.id !== left)!.id;
    const compare = new URL(`${base}compare/`, location.origin);
    compare.searchParams.set('left', left);
    compare.searchParams.set('right', right);
    compare.searchParams.set('return', location.pathname + location.search);
    actions.append(link('比较答案', compare.pathname + compare.search));
  }
  reader.append(actions);
  for (const note of d.notes) {
    const section = el('section', undefined, 'notice');
    section.append(
      el(
        'h3',
        note.kind === 'correction'
          ? '更正说明'
          : note.kind === 'comparison'
            ? '阅读线索'
            : '内容注释',
      ),
      richText(note.html),
      el('p', `${note.author} · ${note.created_at.slice(0, 10)}`, 'small-text muted'),
    );
    reader.append(section);
  }
  if (d.answer) {
    reader.append(el('h3', `从这份回答继续 · ${d.followups.length}`, 'section'));
    for (const q of d.followups) reader.append(nodeLink(q.title, q.id));
    if (!d.followups.length)
      reader.append(el('p', '还没有追问。你想沿着哪个方向继续？', 'muted small-text'));
  } else {
    reader.append(el('h3', `这一版的回答 · ${d.answers.length}`, 'section'));
  }
  if ((!d.answer && d.answers.length) || (d.answer && d.answers.length > 1)) {
    if (d.answer) reader.append(el('h3', '本题的其他回答', 'section'));
    const items = el('div');
    const renderAnswers = (order = 'recorded') => {
      items.replaceChildren();
      const answers = d.answers.filter((a) => !d.answer || a.id !== d.id);
      if (order !== 'recorded')
        answers.sort((a, b) => compareGenerationTime(a, b, order as 'oldest' | 'newest'));
      for (const a of answers) {
        const item = nodeLink(a.withdrawn ? '答案已撤回' : a.name, a.id);
        item.append(
          el('span', a.withdrawn ? '保留位置，可继续访问后面的追问' : a.summary),
          el('span', `${a.date} · ${a.followups} 个追问`),
        );
        items.append(item);
      }
    };
    if (d.answers.length > 1) {
      const bar = el('div', undefined, 'toolbar');
      const label = el('label', '答案顺序');
      label.htmlFor = 'answer-order';
      const order = el('select');
      order.id = 'answer-order';
      for (const [value, name] of [
        ['recorded', '记录顺序'],
        ['oldest', '生成时间 · 从早到晚'],
        ['newest', '生成时间 · 从晚到早'],
      ]) {
        const option = el('option', name);
        option.value = value;
        order.append(option);
      }
      order.addEventListener('change', () => renderAnswers(order.value));
      bar.append(label, order);
      reader.append(bar);
    }
    renderAnswers();
    reader.append(items);
  } else if (!d.answer && !d.answers.length)
    reader.append(
      el(
        'p',
        d.withdrawn
          ? '可从分支图继续访问历史答案。'
          : '还没有回答。可以提交一份已有答案，让探索开始。',
        'muted',
      ),
    );
  if (d.relations.length) {
    const related = el('section', undefined, 'section');
    related.append(el('h3', `关联线索 · ${d.relations.length}`));
    for (const relation of d.relations) {
      const target = new URL(relation.url, location.origin);
      target.searchParams.set('from', d.answer?.id || d.revision!.id);
      const item = link(
        relation.title.slice(0, 140),
        target.pathname + target.search,
        'recent-item',
      );
      item.append(el('span', relation.rationale));
      related.append(item);
    }
    related.append(link('查看关联理由与局部图', `${d.url}#relations`));
    reader.append(related);
  }
  const utilities = el('div', undefined, 'actions');
  const share = el('button', '复制节点链接', 'button small');
  const copy = el('button', '复制当前路径', 'button small');
  const details = el('details');
  details.append(
    el('summary', `查看路径文本${d.copy.complete ? '' : ' · 不完整'}`),
    el('pre', d.copy.text),
  );
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(d.copy.text);
      copy.textContent = '已复制';
    } catch {
      details.open = true;
      copy.textContent = '请在下方手动复制';
    }
  });
  share.addEventListener('click', async () => {
    const target = new URL(`${base}questions/${d.question.id}/`, location.origin);
    target.searchParams.set('focus', d.id);
    try {
      await navigator.clipboard.writeText(target.href);
      share.textContent = '链接已复制';
    } catch {
      const input = el('input');
      input.readOnly = true;
      input.value = target.href;
      input.setAttribute('aria-label', '当前节点链接');
      utilities.append(input);
      input.select();
    }
  });
  utilities.append(share, copy);
  reader.append(utilities, details);
}
async function select(id: string, push = false) {
  const token = ++request;
  if (push) history.pushState({}, '', focusUrl(id));
  if (!source.has(id)) {
    reader.removeAttribute('aria-busy');
    focus = '';
    renderTree();
    reader.replaceChildren(
      el('p', '链接中的节点不属于这棵探索树。', 'error'),
      nodeLink('回到起始问题', root),
    );
    return;
  }
  focus = id;
  document.getElementById('exploration-root')!.hidden = visualId(id) === root;
  expandPath(id);
  renderTree();
  const current = document.getElementById(`tree-${visualId(id)}`);
  if (current) {
    const rowBounds = current.getBoundingClientRect(),
      panelBounds = panel.getBoundingClientRect();
    const visibleBottom = Math.min(panelBounds.bottom, window.innerHeight);
    const visibleHeight = Math.max(150, visibleBottom - panelBounds.top);
    if (rowBounds.top < panelBounds.top + 90 || rowBounds.bottom > visibleBottom)
      panel.scrollTop += rowBounds.top - panelBounds.top - visibleHeight / 2 + rowBounds.height / 2;
  }
  reader.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(`${base}data/nodes/${encodeURIComponent(id)}.json`);
    if (!response.ok) throw Error('内容暂时无法读取');
    const detail = (await response.json()) as Detail;
    if (token !== request) return;
    renderDetail(detail);
    if (push) showReader();
  } catch {
    if (token !== request) return;
    const retry = el('button', '重新读取', 'button small');
    retry.addEventListener('click', () => void select(id));
    const node = source.get(id)!;
    const fallback =
      node.recordUrl ||
      [...source.values()].find((n) => n.kind === 'revision' && n.parent === id)?.url ||
      node.url;
    reader.replaceChildren(
      el('p', '内容暂时无法读取，请重试或打开这条记录。', 'error'),
      retry,
      link('打开完整记录', fallback),
    );
  } finally {
    if (token === request) reader.removeAttribute('aria-busy');
  }
}
async function loadTree() {
  status.hidden = false;
  try {
    const response = await fetch(`${base}data/trees/${encodeURIComponent(root)}.json`);
    if (!response.ok) throw Error();
    const data = (await response.json()) as { nodes: ExplorationNode[] };
    source = new Map(data.nodes.map((node) => [node.id, node]));
    const projection = projectTree(data.nodes);
    aliases = projection.aliases;
    map = new Map(projection.nodes.map((node) => [node.id, node]));
    children.clear();
    for (const node of projection.nodes) {
      const siblings = children.get(node.parent || '') || [];
      siblings.push(node);
      children.set(node.parent || '', siblings);
    }
    const expandInitial = (id: string, depth: number) => {
      if (depth > 2) return;
      expanded.add(id);
      for (const child of children.get(id) || []) expandInitial(child.id, depth + 1);
    };
    expandInitial(root, 0);
    await select(new URLSearchParams(location.search).get('focus') || initial);
  } catch {
    status.hidden = false;
    status.replaceChildren(el('p', '分支暂时无法加载。仍可阅读当前问题或重试。'));
    const retry = el('button', '重新加载分支', 'button small');
    retry.addEventListener('click', () => void loadTree());
    status.append(retry);
  }
}
for (const kind of ['graph', 'list'] as const)
  document.getElementById(`view-${kind}`)!.addEventListener('click', () => {
    view = kind;
    for (const option of ['graph', 'list'])
      document
        .getElementById(`view-${option}`)!
        .setAttribute('aria-pressed', String(option === view));
    renderTree();
  });
document.getElementById('locate-current')!.addEventListener('click', () => {
  expandPath(focus);
  renderTree();
  document.getElementById(`tree-${visualId(focus)}`)?.scrollIntoView({ block: 'nearest' });
});
document.getElementById('collapse-tree')!.addEventListener('click', () => {
  expanded = new Set();
  expandPath(focus);
  limit = 100;
  renderTree();
});
more.addEventListener('click', () => {
  limit += 100;
  renderTree();
});
mobileToggle.addEventListener('click', () => mobileOpen(!panel.classList.contains('mobile-open')));
document.getElementById('mobile-reading')!.addEventListener('click', showReader);
window.addEventListener(
  'popstate',
  () => void select(new URLSearchParams(location.search).get('focus') || initial),
);
window.addEventListener('resize', () => {
  if (source.size) renderTree();
});
void loadTree();
