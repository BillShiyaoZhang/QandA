export interface ExplorationNode {
  id: string;
  kind: 'question' | 'revision' | 'answer';
  label: string;
  parent: string | null;
  url: string;
  recordUrl?: string;
  withdrawn: boolean;
  current?: boolean;
  summary?: string;
  date?: string;
}

// A sole current revision shares its question's visual position. Historical IDs
// remain in the source map and continue to resolve to their exact content.
export function projectTree(nodes: ExplorationNode[]) {
  const revisions = new Map<string, ExplorationNode[]>();
  for (const node of nodes) {
    if (node.kind === 'revision' && node.parent) {
      const group = revisions.get(node.parent) || [];
      group.push(node);
      revisions.set(node.parent, group);
    }
  }
  const aliases = new Map<string, string>();
  for (const [question, versions] of revisions) {
    if (versions.length === 1 && versions[0].current && !versions[0].withdrawn)
      aliases.set(versions[0].id, question);
  }
  return {
    aliases,
    nodes: nodes
      .filter((node) => !aliases.has(node.id))
      .map((node) => ({
        ...node,
        parent: node.parent ? aliases.get(node.parent) || node.parent : null,
      })),
  };
}
