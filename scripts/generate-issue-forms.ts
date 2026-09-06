import fs from 'node:fs';
import YAML from 'yaml';
import { publicConsent } from '../src/lib/issue-intake';
const text = (id: string, label: string, required = false, description?: string) => ({
  type: 'textarea',
  id,
  attributes: { label, ...(description ? { description } : {}) },
  validations: { required },
});
const input = (id: string, label: string, required = false, description?: string) => ({
  type: 'input',
  id,
  attributes: { label, ...(description ? { description } : {}) },
  validations: { required },
});
const sourceNote = text(
  'context_note',
  '来源补充（选填）',
  false,
  '可以写“我自己的想法”、AI 名称、参考链接，或实际提问与背景；知道多少写多少，不清楚就留空。',
);
const consent = {
  type: 'checkboxes',
  id: 'public_consent',
  attributes: {
    label: '公开提交确认',
    options: [
      {
        label: publicConsent,
        required: true,
      },
    ],
  },
};
const intro = {
  type: 'markdown',
  attributes: {
    value:
      '投稿在 GitHub 公开，通过格式和引用检查后自动收录到网站，无需逐条人工审批。写下问题或回答即可，来源补充可以留空。不需要再修改上方已经填好的 Issue 标题。请保留表单标题，正文中同名的 ### 标题请放入闭合的代码围栏。',
  },
};
const forms = [
  {
    file: 'new-question',
    name: '提个新问题',
    description: '保存一个值得继续探索的问题，也可以附带已有答案。',
    body: [
      text(
        'body',
        '问题正文',
        true,
        '直接写下你想问的事，第一行会用作标题；背景可以接着写，不用重复填写。',
      ),
      text('answer_body', '已有答案（选填）'),
      sourceNote,
    ],
  },
  {
    file: 'submit-answer',
    name: '提交已有答案',
    description: '分享自己的回答，或一份已有的 AI 回答。',
    body: [
      input(
        'question_revision_id',
        '回答位置',
        true,
        '网站已自动填写，无需修改。也可粘贴具体问题版本的完整链接。',
      ),
      text(
        'body',
        '答案正文',
        true,
        '可以写自己的想法，也可以粘贴已有回答。引用他人或 AI 内容时，可在来源补充中注明。',
      ),
      sourceNote,
    ],
  },
  {
    file: 'follow-up',
    name: '追问这份回答',
    description: '针对具体答案继续提问，创建一个新分支。',
    body: [
      input(
        'parent_answer_id',
        '追问位置',
        true,
        '网站已自动填写，无需修改。也可粘贴所追问回答的完整链接。',
      ),
      text(
        'body',
        '问题正文',
        true,
        '直接写下你想问的事，第一行会用作标题；背景可以接着写，不用重复填写。',
      ),
      text('answer_body', '已有答案（选填）'),
      sourceNote,
    ],
  },
  {
    file: 'suggest-relation',
    name: '建议内容关联',
    description: '提出跨问题或跨分支的连接，并说明理由。',
    body: [
      input('source_id', '来源内容', true, '网站已自动填写，无需修改。'),
      input(
        'target_id',
        '另一段内容',
        true,
        '在网站选择内容会自动填写，也可粘贴具体问题版本或回答的完整链接。',
      ),
      {
        type: 'dropdown',
        id: 'relation_type',
        attributes: {
          label: '关联类型',
          options: ['主题相关', '观点支持', '观点冲突'],
          default: 0,
        },
        validations: { required: true },
      },
      text(
        'rationale',
        '关联理由',
        true,
        '支持/冲突请说明具体论点与适用条件。相似度本身不证明逻辑关系。',
      ),
      text('source_excerpt', '来源原文片段', false, '观点支持/冲突必需，须与原文一致。'),
      text('target_excerpt', '目标原文片段', false, '观点支持/冲突必需，须与原文一致。'),
    ],
  },
];
fs.mkdirSync('.github/ISSUE_TEMPLATE', { recursive: true });
for (const f of forms)
  fs.writeFileSync(
    `.github/ISSUE_TEMPLATE/${f.file}.yml`,
    YAML.stringify({
      name: f.name,
      description: f.description,
      title: `[${f.name}] `,
      body: [intro, ...f.body, consent],
    }),
  );
fs.writeFileSync(
  '.github/ISSUE_TEMPLATE/config.yml',
  YAML.stringify({ blank_issues_enabled: true }),
);
