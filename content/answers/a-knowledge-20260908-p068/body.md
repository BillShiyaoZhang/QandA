_本次整理（2026-09-08），非原对话逐字回答。_

**Decoder-only 与 MoE 不是二选一，而是两个不同的分类维度。**Decoder-only 描述语言模型怎样按因果顺序处理上下文、预测后续 token；Dense／MoE 描述某些子层是否让所有 token 共用一个前馈网络，或由路由器选择专家子网络。一个模型完全可以同时是 decoder-only 和 MoE。

原问后续引用的是 **Mistral Small 3.1（2503）**，所以应以这个版本为准。它的语言骨干是稠密的自回归 Mistral 解码器，并未使用 Mixtral 式专家路由；其公开配置将文本部分标为 `mistral`，对应实现使用普通 Mistral MLP。整个 Small 3.1 还包括视觉编码器和连接模块，因此“语言骨干是 decoder-only”比“整个多模态模型只有 decoder”更准确。[官方配置](https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503/blob/main/config.json)、[Mistral 实现](https://github.com/huggingface/transformers/blob/main/src/transformers/models/mistral/modeling_mistral.py)

作为对照，Mixtral 8×7B 在各层放置八个前馈专家，并对每个 token 选其中两个处理。它仍然进行自回归文本生成，这正好说明两种分类可以同时成立。[Mixtral 原始论文](https://arxiv.org/abs/2401.04088)

官方文案中的 **subject matter experts（领域专家）**，说的是把 Small 3.1 用领域数据继续微调，使某个模型更擅长相关任务；它不是在声明模型内部有 MoE 专家，也没有保证每个专家对应一个固定学科。[Small 3.1 官方介绍](https://mistral.ai/news/mistral-small-3-1/)

例如，一个经过特定领域微调的稠密模型可以被称为“领域专家”；一个 MoE 模型也可能仍是通用模型。领域专长是训练与表现层面的说法，MoE 是结构层面的说法，不能因为共用了 expert 这个词就混为一谈。此处结论仅针对明确的 Small 3.1 版本，不应外推到所有带有“Mistral Small”名称的历史或后续模型。
