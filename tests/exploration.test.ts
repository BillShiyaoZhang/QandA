import test from 'node:test';
import assert from 'node:assert/strict';
import { projectTree, type ExplorationNode } from '../src/lib/exploration';
const node = (
  id: string,
  kind: ExplorationNode['kind'],
  parent: string | null,
  extra = {},
): ExplorationNode => ({ id, kind, parent, label: id, url: '/', withdrawn: false, ...extra });
test('a sole current version shares the question position without changing source history', () => {
  const nodes = [
    node('q', 'question', null),
    node('r-uuid', 'revision', 'q', { current: true }),
    node('a', 'answer', 'r-uuid'),
    node('followup', 'question', 'a'),
  ];
  const projected = projectTree(nodes);
  assert.deepEqual(
    projected.nodes.map((n) => [n.id, n.parent]),
    [
      ['q', null],
      ['a', 'q'],
      ['followup', 'a'],
    ],
  );
  assert.equal(projected.aliases.get('r-uuid'), 'q');
  assert.equal(nodes[2].parent, 'r-uuid');
});
test('multiple revisions and withdrawn versions preserve separate historical branches', () => {
  const nodes = [
    node('q', 'question', null),
    node('old', 'revision', 'q'),
    node('new', 'revision', 'q', { current: true }),
    node('a-old', 'answer', 'old'),
    node('a-new', 'answer', 'new'),
  ];
  const projected = projectTree(nodes);
  assert.equal(projected.aliases.size, 0);
  assert.deepEqual(projected.nodes, nodes);
  const withdrawn = [
    node('q', 'question', null),
    node('r', 'revision', 'q', { current: true, withdrawn: true }),
  ];
  assert.equal(projectTree(withdrawn).nodes.length, 2);
});
