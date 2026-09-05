# QandA · 问题探索档案

把有趣的问题、不同来源的答案、回答后的追问，以及不同探索路径之间的关联保存下来。每份答案固定关联当时的问题版本，追问从一份具体答案继续展开。

首版已经实现静态网站、内容校验、访客投稿表单和维护工具。内置 **27 个问题、41 份答案、3 条关联、1 条注释**，均为明确标识的开发样例；不代表真实社区投稿或模型评测。公开投稿通过 GitHub Issue Forms 进行，需要 GitHub 账号；本项目不自动调用模型。

- [设计与可行性分析](docs/design.md)
- [实现说明](docs/implementation.md)
- [验证记录与上线验收](docs/verification.md)
- [投稿与维护流程](CONTRIBUTING.md)

## 本地运行

使用 `.node-version` 中的 Node.js 版本（22.22.3）。

```sh
npm ci
npm run dev -- --port 4321
```

打开终端显示的本地地址。当前 Astro 版本会以后台服务方式运行开发服务器，使用 `npx astro dev status`、`npx astro dev logs` 和 `npx astro dev stop` 查看及停止服务。

```sh
npm run validate
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e -- site.spec.ts
```

在禁止写入全局偏好的环境中，可以设置 `ASTRO_TELEMETRY_DISABLED=1`。构建产物在 `dist/`，不写入 Git。页面内容来自 `content/`，没有数据库或 API 密钥。

## 浏览与管理

首页按主题筛选，搜索支持中文。问题页面可以切换历史修订、按记录顺序或生成时间排列答案；同一问题的两份答案可以并排阅读、查看条件差异。生成时间未知的记录不被填成录入时间。

答案页面保留实际提问、来源、已知生成条件和提交者提供的上下文。复制路径只包含当前祖先链及所选答案，不包含兄弟答案或横向关联。探索树可折叠、定位和分享，手机上可以切换目录与阅读区。

关联连接具体版本的内容。自动词项检索只产生待审候选；维护者确认理由后才会在局部关系图展示。归档让分支停止接收投稿；撤回隐藏公开站点中的正文并保留可导航的历史位置。

## GitHub Pages

工作流已经配置为：PR 运行校验、类型检查、测试、静态构建和浏览器验收；`main` 更新后构建 Pages 产物并部署。Actions 使用固定提交版本，投稿内容不会自动执行，也没有 `pull_request_target` 或收到 Issue 后直接发布的工作流。

手动验证 Pages 子路径：

```sh
SITE_URL=https://billshiyaozhang.github.io SITE_BASE=/QandA npm run build
TEST_BASE_PATH=/QandA npm run test:e2e -- site.spec.ts
```

仓库需要由所有者确认访问范围，并在 Settings → Pages 选择 GitHub Actions。公开访客投稿还要求 Issues 可对访客访问。当前 GitHub 仓库是私有仓库；改变仓库可见性会同时公开已有提交历史，不能只把它当作站点开关。确认公开之前，可先本地运行或使用仅所有者可见的预览。

`.openai/hosting.json` 另用于 Sites 私有预览，`static.directory` 指向 `dist`。Sites 预览使用根路径构建；GitHub Pages 使用 `/QandA`，两者共用同一套源码。

## 更多验证

```sh
npm run verify:export
npm run benchmark -- --build
BENCHMARK_BROWSER=1 TEST_DIST_DIR=.local/benchmark-dist TEST_BASE_PATH=/QandA npm run test:e2e -- benchmark.spec.ts
```

测试数据、日志、候选和审核草稿保存在被忽略的 `.local/`，不会进入站点。`npm run seed` 只用于初始化开发样例，不覆盖已经存在的记录。

当前暂时禁止格式化 `.astro` 文件：现用 `prettier-plugin-astro` 在部分条件表达式中会丢失相邻标签，已在 `.prettierignore` 排除。TypeScript、测试和配置仍可运行 `npm run format`；不要移除此排除项后批量改写页面。
