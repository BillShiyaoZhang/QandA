import type { Answer, Context } from './schema';
const stable = (value: unknown): string =>
  value === null || typeof value !== 'object'
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? '[' + value.map(stable).join(',') + ']'
      : '{' +
        Object.keys(value)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + stable((value as Record<string, unknown>)[k]))
          .join(',') +
        '}';
type Input = { answer: Answer; snapshot: Context | null; revision: { id: string; text: string } };
/** Equality of submitted, visible evidence is never proof of replayability. */
export function compareConditions(left: Input, right: Input) {
  const reasons: string[] = [];
  if (left.revision.id !== right.revision.id) reasons.push('提问修订不同');
  if (!left.snapshot?.messages.length || !right.snapshot?.messages.length)
    reasons.push('实际输入未提供');
  else if (stable(left.snapshot.messages) !== stable(right.snapshot.messages))
    reasons.push('可见输入不同');
  for (const item of [left, right]) {
    const last = item.snapshot?.messages.at(-1);
    if (last && (last.role !== 'user' || last.content !== item.revision.text)) {
      reasons.push('实际末轮提问与所选修订未对齐');
      break;
    }
  }
  if (
    left.answer.context.visible_history_completeness !== 'complete' ||
    right.answer.context.visible_history_completeness !== 'complete'
  )
    reasons.push('可见历史未声明完整');
  if (left.snapshot?.attachments.length || right.snapshot?.attachments.length)
    reasons.push('附件输入尚未支持条件核对');
  const a = left.answer.generation,
    b = right.answer.generation;
  if (!a.protocol?.trim() || !b.protocol?.trim()) reasons.push('生成协议未知');
  else if (a.protocol !== b.protocol) reasons.push('生成协议不同');
  if (a.parameters === null || b.parameters === null) reasons.push('显式参数未知');
  else if (stable(a.parameters) !== stable(b.parameters)) reasons.push('显式参数不同');
  if (a.tools !== 'none' || b.tools !== 'none') reasons.push('工具配置无法对齐');
  return { aligned: reasons.length === 0, reasons };
}
