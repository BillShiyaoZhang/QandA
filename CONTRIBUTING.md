# 投稿与维护

## 访客投稿

从网站的「提个新问题」「提交本题答案」「追问这份回答」或「建议关联」入口进入 GitHub 表单。需要 GitHub 账号；提交后系统自动检查表单、公开提交确认和引用位置，通过后收录并发布，无需维护者逐条审批。公开仓库中的 Issue 在网站收录前也公开，请先删除私人信息、密钥和无权公开的内容。

提交已有答案即可，不必为了投稿重新生成。不知道模型版本、时间或上下文时选择未知。模型显示名称来自提交者声明，收录不证明身份或事实正确。问题、答案和引用片段应保持原意，注明已知来源；提交表示允许项目存储、展示你的投稿及必要的格式整理，不替代第三方内容的授权。

追问应明确针对一份答案。修改同一个问题的实际提问属于修订；在另一条上下文中提出相同文字仍是另一个问题。对内容的更正可以通过 Issue 说明目标链接及证据，由维护者添加注释。

## 自动收录与进度

机器人在原 Issue 更新一条状态回复和标签。缺少字段、日期无效、目标不存在或已归档等问题会说明原因；投稿者修改原表单，保存后自动重试。请保留正文中的表单字段标题；正文如有同名 `###` 标题，请置于闭合的代码围栏中。

一条 Issue 只自动收录一次。之后编辑、重开、修改标签或机器人回复都不会重复创建内容，也不会覆盖原文。补充答案或追问请新建投稿；更正、撤回请求留待事后处理。关闭 Issue 不等于撤回网站内容。

「已收录」表示内容和来源收据已经保存，「已上线」取决于后续 Pages 发布成功，通常需要几分钟。失败时旧站点继续可读，每 6 小时的补扫会重试；维护者也可从 Actions 手动运行 `Collect issue submissions`。操作说明见 [自动化文档](docs/automation.md)。

平台只归集与展示；用户提交的关联标记为社区判断，算法生成的词项候选仍需确认。定期监督、争议处理与内容撤回由维护者事后进行，不构成普通投稿的前置审批。

## 事后维护与特殊导入

以下本地工具用于更正、注释、撤回及特殊来源，不是普通投稿的必经步骤。在独立内容分支上操作，先同步 `main`。本地审核命令只更新内容文件，不会向 GitHub 发送评论、关闭 Issue 或自动发布网站。

```sh
git switch -c content/review-example
npm run import -- --issue https://github.com/BillShiyaoZhang/QandA/issues/123 --kind answer
```

将示例 Issue 编号替换为实际投稿。支持 `question`、`answer`、`follow-up`、`relation`。导入需要已登录的 `gh`，读取源 Issue 的完整文本、作者和更新时间。检查终端返回的 `.local/submissions/<key>.json`，核对正文、目标版本、公开许可、引用、模型声明及未知项。

```sh
npm run review -- --draft .local/submissions/ACTUAL_KEY.json --reviewer YOUR_NAME --publish
# 或驳回本地草稿
npm run review -- --draft .local/submissions/ACTUAL_KEY.json --reviewer YOUR_NAME --reject
```

`--publish` 表示审核内容文件；还需要审阅差异、提交 PR 并合并才能更新网站。答案和追问组合先整体验证，再一次写入；任一部分无效就不收录。审核前再次检查目标是否已归档、撤回或修改。

本地特殊导入依据「来源 URL + 更新时间 + 正文哈希」去重；成功收录的收据进入 `content/imports/`。本地工具允许明确追加新的来源快照，不覆盖历史；自动入口另有每条 Issue 仅一次成功收录的限制。修改本地导入解释或重试已驳回的草稿时使用 `--refresh` 重新导入并审阅。

## 本地文件导入、修订与注释

使用以下结构创建 JSON 文件，然后运行 `npm run import -- --file FILE.json`。`source.body` 必须是对应来源的原文；不要为真实投稿编造作者或 Issue 地址。维护者自有材料也应有可追溯的实际来源 URL。

```json
{
  "source": {
    "url": "https://github.com/BillShiyaoZhang/QandA/issues/123",
    "updated_at": "2026-09-06T02:00:00Z",
    "author": "actual-github-login",
    "body": "此处保存来源原文"
  },
  "submission": {
    "kind": "revision",
    "question_id": "q-001",
    "body": "修订后的完整提问文本",
    "public_consent": true
  }
}
```

注释使用 `kind: "annotation"`、`target_id`、`annotation_kind`、`body` 和可选 `evidence_urls`。支持 `note`、`correction`、`comparison`、`fact_check`；这些类型表达注释用途，不意味着自动事实核验。答案支持 `context_messages`、`context_path_ids`、`context_completeness`，只记录实际提供的文本；看不到的历史保持未知。完整字段由 `src/lib/submissions.ts` 中的 `submissionSchema` 定义。

生成规则可以通过表单「生成规则（选填）」或 `generation_protocol` 原样提交。维护者也可通过文件的完整 `generation` 对象导入已知的供应商、渠道、请求/返回模型、时间精度、协议、参数、工具及结束状态；结构见 `generationSchema`，未知字段为 `null` 或对应未知枚举。它仍属于提交者声明，不会升级成平台捕获。若与简要模型名称、日期或规则冲突，导入器要求先核对，不会静默覆盖。


## 关联确认

```sh
npm run relations -- --node a-001-a
npm run relation:review -- --candidate .local/relation-candidates/ACTUAL_ID.json --reviewer YOUR_NAME --confirm --reason '具体说明共享的概念和适用范围'
# 或保留驳回决定
npm run relation:review -- --candidate .local/relation-candidates/ACTUAL_ID.json --reviewer YOUR_NAME --reject --reason '只是词汇相近，讨论对象不同'
```

候选分数只用于排序，不能解释为可信度。自动候选只表示主题相关；用户提交的支持或冲突关联必须提供双方原文片段和理由，自动检查后标记为社区提交。候选确认前重新校验端点版本及可见性。已收录关系保持不可变；需要更正判断时撤回旧关系并新建替代关系，保留原记录。

## 归档与撤回

```sh
npm run manage -- --archive --id q-001 --reviewer YOUR_NAME
npm run manage -- --reopen --id q-001 --reviewer YOUR_NAME
npm run manage -- --withdraw answer --id a-001-a --reviewer YOUR_NAME --reason '撤回原因'
npm run manage -- --withdraw revision --id q-006.r2 --replacement q-006.r1 --reviewer YOUR_NAME --reason '撤回原因'
```

撤回当前修订时必须指定同题有效替代修订，或者先撤回整个问题。历史正文不可原地编辑；更正用新修订或注释。公开站点重新构建后隐藏撤回正文、引用片段和依赖它的上下文；源文件、Git 历史、旧部署、外部缓存和原 Issue 并不自动删除。若涉及敏感信息，维护者还需处理这些实际来源，不能把普通撤回当成彻底清除。

## 中断恢复及发布

本地更新使用排他锁、暂存目录和事务记录。如果进程异常退出，先保留工作副本，再运行：

```sh
npm run review -- --recover
npm run validate
```

仍在运行的事务不能被恢复命令抢占。没有明确完成证据的备份会保留并报告歧义，需人工检查，避免猜测哪份内容正确。

```sh
git diff
npm run validate -- --base origin/main
npm run check
npm test
npm run build
```

在 PR 中说明新增内容、原始来源、审核判断和已运行的检查。合并前确认审核对象仍是当前 PR 提交；不要绕过校验去改写已经发布的修订、答案、上下文或导入收据。页面注释和管理元信息可追加；代码源码许可证尚未指定，不要代替所有者承诺额外授权。
