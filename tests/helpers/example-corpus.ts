import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { sha256, publication } from '../../src/lib/content';
import { unknownGeneration, type Question, type Answer, type Revision } from '../../src/lib/schema';

/** Test-only corpus. It cannot be written into the production content directory. */
export function createExampleCorpus(directory: string) {
  const root = path.resolve(directory);
  if (!root.startsWith(path.resolve(os.tmpdir()) + path.sep))
    throw new Error('Test fixtures must be created under the system temporary directory');
  if (fs.existsSync(path.join(root, 'questions')))
    throw new Error('Refusing to overwrite an existing fixture');
  const date = '2026-09-06T02:00:00+08:00';
  function write(file: string, data: unknown) {
    const p = path.join(root, file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
  }
  function pub(kind: Parameters<typeof publication>[0], id: string) {
    write(`publications/${kind}/${id}.json`, {
      ...publication(kind, id, 'seed:maintainer'),
      reviewed_at: date,
    });
  }
  function question(
    id: string,
    title: string,
    tags: string[],
    parent: string | null = null,
    body = title,
  ) {
    const rid = `${id}.r1`;
    const q: Question = {
      schema_version: 1,
      id,
      parent_answer_id: parent,
      current_revision_id: rid,
      title,
      tags,
      created_at: date,
      created_by: 'seed:editor',
      state: 'active',
      copied_from_question_id: null,
      is_example: true,
    };
    write(`questions/${id}/question.json`, q);
    const r: Revision = {
      schema_version: 1,
      id: rid,
      question_id: id,
      body_path: `questions/${id}/revisions/${rid}.md`,
      body_sha256: sha256(body),
      created_at: date,
      created_by: 'seed:editor',
      change_note: '初始提问',
    };
    write(`questions/${id}/revisions/${rid}.json`, r);
    write(r.body_path, body);
    pub('question', id);
    pub('revision', rid);
    return rid;
  }
  function answer(id: string, rid: string, body: string) {
    const a: Answer = {
      schema_version: 1,
      id,
      question_revision_id: rid,
      body_path: `answers/${id}/body.md`,
      body_sha256: sha256(body),
      submitted_at: date,
      submitted_by: 'seed:editor',
      provenance: { kind: 'development_example', source_url: null, identity_evidence: 'unknown' },
      generation: { ...unknownGeneration(), channel: 'development_sample' },
      context: {
        snapshot_id: null,
        capture_kind: 'unknown',
        visible_history_completeness: 'unknown',
        matches_site_path: 'unknown',
      },
      run_id: null,
      is_example: true,
    };
    write(`answers/${id}/meta.json`, a);
    write(a.body_path, body);
    pub('answer', id);
    return a;
  }
  const seeds: [string, string[], string, string][] = [
    [
      '如果森林的声音被完整录下，能重建那片森林吗？',
      ['信息', '自然'],
      '## 记录和重建之间\n\n一份录音保存了传到麦克风的声压变化。它能提示某些动物、天气和活动，却没有直接保存树木的位置、土壤成分或没有发声的生命。不同的场景可能产生相似的录音，因此录音通常不能唯一决定原来的森林。\n\n更可检验的问法是：需要重建森林的哪些特征，以及允许多大误差？',
      '## 先定义“重建”\n\n如果目标是让人听起来仿佛置身林中，空间录音已经可以保留一部分感受。如果目标是恢复生态系统，就需要声音以外的观测。两种目标需要的信息量不同。\n\n可以先选择一个小目标，例如从连续录音推测鸟鸣活动的变化，再用实地观察检验。',
    ],
    [
      '0.999…为什么等于1？',
      ['数学', '无限'],
      '## 从误差看无限小数\n\n小数 0.9、0.99、0.999 与 1 的差依次是 0.1、0.01、0.001。无限循环小数表示这个序列的极限，而不是某个“最后还有一点差距”的有限小数。差的极限为 0，所以在实数体系中 0.999… = 1。\n\n关键前提是省略号表示无限延伸，以及采用通常的实数定义。',
      '## 用等比级数表达\n\n0.999… = 9/10 + 9/100 + 9/1000 + …。这个等比级数的和是 (9/10) / (1 - 1/10) = 1。\n\n这也说明十进制表示并不总是唯一：同一个实数可以有两种写法。有限位计算时则需要另行考虑精度与舍入。',
    ],
    [
      '一张地图能和它描述的城市一样完整吗？',
      ['信息', '模型'],
      '## 地图是一种取舍\n\n地图服务于目的。步行者、排水工程师和鸟类研究者需要的城市信息并不相同。为了可读性，地图会选择、概括和省略。\n\n把“完整”改成“足以完成某项任务”，就能讨论地图缺失的信息是否重要，而不必要求它复制整个城市。',
      '## 完整还涉及变化\n\n即使某一时刻记录了所有街道和建筑，城市也会继续变化。一张静态地图可以对过去的某个时刻准确，却不一定描述现在。\n\n因此地图的覆盖范围、采集时间和更新方式都应该与内容一起保存。',
    ],
    [
      '随机和“我们还不知道规律”有什么不同？',
      ['概率', '认识'],
      '## 预测能力是一条线索\n\n一段序列难以预测，可能源于产生过程的随机性，也可能因为观察者没有掌握足够信息。只观察少量结果，通常不足以区分两者。\n\n可以先问：过程是什么、观察者知道什么、预测任务如何定义？不同条件会改变“随机”的含义。',
      '## 从模型而非直觉开始\n\n统计分析可以检验数据是否符合某种随机模型，但通过检验不等于证明过程“本质随机”。伪随机算法能产生符合许多统计特征的序列，同时由内部状态决定结果。\n\n这里值得分开讨论统计随机性、不可预测性和物理随机性。',
    ],
    [
      '公平是否意味着每个人获得相同的东西？',
      ['思考', '社会'],
      '## 平等分配只是一个标准\n\n按人头均分是一种清楚的规则，但不同人的需要、既有资源和责任可能不同。“每人一样多”与“每人得到足够支持”可能给出不同分配。\n\n判断公平需要先说清楚希望保护什么价值，再讨论规则能否一致地实现它。',
      '## 从程序与结果分别看\n\n人们既可能关心结果，也可能关心形成结果的程序。透明、一致、可申诉的程序不自动保证结果相同。\n\n用具体案例讨论会更清楚：分蛋糕、分救援资源和安排轮流使用设备，适合的规则未必一样。',
    ],
    [
      '为什么同一个问题换种问法，答案就变了？',
      ['语言', '模型'],
      '## 问法携带了前提\n\n语言不仅描述任务，也暗示范围、预设和希望采用的角度。“有哪些好处”和“是否值得做”看似谈同一件事，要求的推理却不同。\n\n比较答案时需要保存实际提问，而不只保存一个简短标题。',
      '## 还要考虑生成条件\n\n措辞变化可能影响输出，但输出差异也可能来自采样、隐藏上下文或工具结果。要研究问法的作用，可以固定其他已知条件，对一组改写重复生成并保留全部记录。\n\n单个前后例子只能提供观察线索。',
    ],
    [
      '如果所有人都记得同一件事，记忆就一定准确吗？',
      ['认识', '记忆'],
      '## 一致性和准确性不同\n\n多人记忆相同，可以增加某些判断的可信度，但要看他们是否独立获得信息。共同接触的叙述也可能让错误一致地传播。\n\n核查时应寻找形成时间不同、来源独立的记录，而不只数有多少人赞同。',
      '## 先拆开记忆的内容\n\n“发生过这件事”和“当时说了某个精确句子”需要不同强度的证据。多人可能对大意一致，却对细节各有偏差。\n\n把事件、顺序、措辞和解释拆开，可以避免把某一部分的共识扩大到整段记忆。',
    ],
    [
      '一件东西换掉所有零件后，还是原来那件吗？',
      ['哲学', '身份'],
      '## 身份依赖判断标准\n\n如果标准是物质连续性，更换全部零件会带来问题。如果标准是功能、历史或社会约定，它可能仍被视为原来的物件。\n\n这个问题适合先列出不同标准，再看每个标准在哪些场景中有用。',
      '## 再加入旧零件\n\n如果把拆下的旧零件重新组装，新的组合也可能声称自己是“原来那件”。这一变化暴露了不同身份标准之间的冲突。\n\n不必急于选出唯一答案，可以比较各个标准在维修、收藏或法律登记中的作用。',
    ],
    [
      '一个解释越简单，就越接近真相吗？',
      ['科学', '模型'],
      '## 简单有助于比较\n\n当多个解释同样符合观测时，较简单的解释常更容易理解和检验。但“简单”不是独立于证据的真实性保证。一个遗漏重要条件的解释也可能很简短。\n\n需要同时比较解释力、预测表现和复杂度。',
      '## 简单取决于表达方式\n\n用不同概念描述，同一个模型可能显得简单或复杂。评价解释时应说清楚复杂度如何衡量，并观察它对新情形的预测。\n\n一个实用问题是：这个解释在哪些情况下会失败？',
    ],
    [
      '我们能证明一个程序永远不会出错吗？',
      ['计算', '证明'],
      '## 证明需要明确规格\n\n“不会出错”必须被写成可判断的性质：输入范围、预期输出和运行环境是什么？对限定系统，可以用形式化方法证明某些性质，但证明依赖规格与假设。\n\n测试则在具体样例上提供证据，无法仅凭有限样例涵盖任意行为。',
      '## 把承诺缩到可检验的范围\n\n与其承诺整个软件永远正确，可以先证明一个解析器不会越界，或一个状态转换保持某个不变量。运行环境和外部服务仍可能产生未覆盖的情况。\n\n证明的对象、前提和未覆盖边界应一起公开。',
    ],
    [
      '一个失败的实验值得被保存吗？',
      ['科学', '记录'],
      '## 失败也包含信息\n\n一次实验没有得到预期结果，可能帮助排除某种解释，或揭示设计与测量问题。若只保存成功案例，后来者难以知道哪些路径已经尝试过。\n\n记录失败时应保留条件和过程，不把“没看到”直接等同于“不存在”。',
      '## 可解释性决定复用价值\n\n只有“失败了”三个字，通常很难帮助下一位研究者。更有用的是预期、实际观察、仪器限制和已知异常。\n\n失败记录的价值来自别人能够理解它究竟约束了什么。',
    ],
    [
      '不同语言里没有对应词的概念，能被翻译吗？',
      ['语言', '理解'],
      '## 翻译可以使用解释\n\n没有一一对应的词，并不意味着无法交流。短语、例子和情境可以补充一个词承载的意义，只是篇幅和联想可能改变。\n\n“能否翻译”也应区分传达基本指称、情绪色彩与文化背景。',
      '## 先决定保留什么\n\n文学、技术说明和日常对话对翻译的要求不同。某些译法保留字面结构，某些更重视读者得到的效果。\n\n可以比较几种译法分别保留或牺牲了什么，而不把翻译理解为机械替换。',
    ],
    [
      '如果时间只能通过变化被察觉，没有变化时还有时间吗？',
      ['哲学', '时间'],
      '## 先分开观测与存在\n\n“能不能测量时间”与“时间是否存在”是不同问题。没有可用变化，观察者可能无法构造时钟，但这一步并不自动决定时间的本体地位。\n\n讨论时需要注明采用的是操作性定义还是形而上学主张。',
      '## 思想实验需要边界\n\n设想完全没有变化时，要进一步问观察者的思考是否也停止。如果仍允许思考变化，设定就没有完全排除变化。\n\n澄清这些条件，往往比立即回答“有”或“没有”更能推进讨论。',
    ],
    [
      '两条完全不同的路径，可能得出同一个结论吗？',
      ['推理', '关联'],
      '## 结论相同不代表过程相同\n\n不同前提和方法可能导向同一结论。在数学中，不同证明可能揭示不同结构；在经验问题中，独立证据的一致也有价值。\n\n应继续检查路径是否独立、前提是否成立，避免只看终点。',
      '## 相同也可能只是表达相近\n\n两段文字看似得出相同结论，但讨论的范围、时间或对象可能不同。关联它们时，应标出具体论点和适用条件。\n\n这能帮助区分主题相关、观点支持以及表面上的一致。',
    ],
    [
      '一个好问题必须有答案吗？',
      ['思考', '提问'],
      '## 问题可以先开辟方向\n\n一个问题即使暂时没有答案，也可能帮助识别隐含前提、设计观察，或找到更具体的子问题。它的价值不完全由回答速度决定。\n\n值得记录下一步需要什么证据或概念，而不只记录“尚无答案”。',
      '## 可继续性是一种标准\n\n过于含糊的问题可能需要先澄清定义。能让讨论继续的问题，往往使人看见可以采取的下一步：比较案例、修改假设或提出更小的追问。\n\n这也是保存探索路径的理由。',
    ],
  ];
  seeds.forEach(([title, tags, a, b], i) => {
    const q = `q-${String(i + 1).padStart(3, '0')}`;
    const rid = question(q, title, tags);
    answer(`a-${String(i + 1).padStart(3, '0')}-a`, rid, a);
    answer(`a-${String(i + 1).padStart(3, '0')}-b`, rid, b);
  });
  const followups = [
    [
      'q-001',
      '录音缺少的信息，可以用其他传感器补齐吗？',
      '增加图像、温度或位置等观测，可以补充声音没有记录的维度。不过更多数据不等于对目标没有遗漏。应先定义要重建的特征，再评估每种传感器的增益。',
      '怎样判断增加的观测真的提供了新信息？',
    ],
    [
      'q-002',
      '有限精度的计算机也会把0.999…存成1吗？',
      '计算机存储的是某种有限表示。输入中有限个9、一个表示极限的符号表达式，以及浮点运算结果是不同对象。不能把实数的等式直接当作所有数值输入都得到同一存储结果。',
      '该怎样区分表示误差和推理错误？',
    ],
    [
      'q-003',
      '地图的更新时间应该怎样呈现？',
      '可以同时保存原始数据采集时间和地图发布的时间。若不同区域来自不同批次，单一“更新日期”可能掩盖差异。标明时间精度和未知状态有助于读者判断是否适用。',
      '不知道具体采集日期时，应该怎样标注？',
    ],
    [
      'q-006',
      '如何只改变问法而保持其他条件一致？',
      '可以固定可见上下文、参数和工具设置，事先列出改写，再对每个条件重复取样。服务端未知因素仍需明确列为限制。这种实验能改善归因，但不能承诺完全控制所有因素。',
      '每种问法只有一份答案够用吗？',
    ],
    [
      'q-014',
      '如何确认两份答案讨论的是同一个结论？',
      '先挑出双方明确的论点，再比较对象、量词、时点和前提。如果一份回答说“总是”，另一份只说“有时”，它们并不是同样的承诺。文本相似只适合作为待检查线索。',
      '关联的理由也应该保存版本吗？',
    ],
  ];
  followups.forEach(([parent, title, body, next], i) => {
    const n = i + 1;
    const q = `q-follow-${n}`;
    const rid = question(q, title, ['继续追问'], `a-${parent.slice(2)}-a`);
    answer(`a-follow-${n}`, rid, body);
    const rid2 = question(`q-deeper-${n}`, next, ['继续追问'], `a-follow-${n}`);
    answer(
      `a-deeper-${n}`,
      rid2,
      '可以先明确判断标准，再记录所采用的证据与限制。把这一步的实际提问和回答完整保存，之后才能区分新的发现与表述变化。\n\n这是一条用于展示多轮路径的开发样例，欢迎用真实探索记录替换。',
    );
  });
  question('q-unanswered', '“理解一个问题”究竟意味着什么？', ['理解', '等待回答']);
  question('q-sibling', '只留下文字描述，和留下录音有什么不同？', ['信息'], 'a-001-a');
  const old = JSON.parse(fs.readFileSync(path.join(root, 'questions/q-006/question.json'), 'utf8'));
  old.current_revision_id = 'q-006.r2';
  write('questions/q-006/question.json', old);
  const newBody = '在保持上下文和其他已知条件一致时，同一个问题换种问法，答案为什么可能变化？';
  write('questions/q-006/revisions/q-006.r2.md', newBody);
  write('questions/q-006/revisions/q-006.r2.json', {
    schema_version: 1,
    id: 'q-006.r2',
    question_id: 'q-006',
    body_path: 'questions/q-006/revisions/q-006.r2.md',
    body_sha256: sha256(newBody),
    created_at: date,
    created_by: 'seed:editor',
    change_note: '限定其他已知条件，保留初版及其回答',
  });
  pub('revision', 'q-006.r2');
  answer(
    'a-006-new',
    'q-006.r2',
    '问题改写可能改变模型对任务范围与前提的理解。这里的限定让比较目标更清楚，但仍应通过重复采样观察变化，而不是从一对答案认定因果。',
  );
  for (const [i, source, target, reason] of [
    [1, 'q-001.r1', 'q-003.r1', '两者都在问：一种记录会省略哪些现实信息？'],
    [2, 'a-006-a', 'a-014-b', '比较答案都需要区分表述、讨论范围与前提。'],
    [3, 'q-011.r1', 'q-015.r1', '两者都讨论暂未得到明确结论的探索为什么值得保留。'],
  ] as const) {
    const getHash = (id: string) =>
      id.startsWith('a-')
        ? JSON.parse(fs.readFileSync(path.join(root, `answers/${id}/meta.json`), 'utf8'))
            .body_sha256
        : JSON.parse(
            fs.readFileSync(
              path.join(root, `questions/${id.split('.')[0]}/revisions/${id}.json`),
              'utf8',
            ),
          ).body_sha256;
    const id = `rel-${i}`;
    write(`relations/${id}.json`, {
      schema_version: 1,
      id,
      source_ref: {
        entity_type: source.startsWith('a-') ? 'answer' : 'revision',
        entity_id: source,
        body_sha256: getHash(source),
      },
      target_ref: {
        entity_type: target.startsWith('a-') ? 'answer' : 'revision',
        entity_id: target,
        body_sha256: getHash(target),
      },
      type: 'related_topic',
      rationale: reason,
      source_excerpt: '',
      target_excerpt: '',
      origin: 'manual',
      proposed_by: 'seed:editor',
      created_at: date,
      method_version: null,
      candidate_score: null,
      decision: 'confirmed',
      decided_by: 'seed:maintainer',
      decided_at: date,
    });
    pub('relation', id);
  }
  const note =
    '这两份开发样例从信息丢失和重建目标两个角度展开。它们的侧重点不同，尚不能作为真实模型之间的能力比较。可以沿“需要哪些额外观测”继续提问。';
  write('annotations/note-forest.md', note);
  write('annotations/note-forest.json', {
    schema_version: 1,
    id: 'note-forest',
    target_type: 'question',
    target_id: 'q-001',
    kind: 'comparison',
    body_path: 'annotations/note-forest.md',
    body_sha256: sha256(note),
    author: 'seed:editor',
    created_at: date,
    evidence_urls: [],
    scope: '阅读两份开发样例',
  });
  pub('annotation', 'note-forest');
}
