_本次整理（2026-09-08），非原对话逐字回答。_

**IRI 是 Internationalized Resource Identifier（国际化资源标识符）**，是 URI 的推广，允许在规定位置使用更广的 Unicode 字符。它用来命名资源；名字看起来像网址，不代表它一定能下载到网页。[RFC 3987](https://www.rfc-editor.org/rfc/rfc3987)

在知识工程里，IRI 可标识类、属性和具名个体。例如 `https://example.org/Book` 可以约定表示“书”这一类；它的含义由数据和词汇表约定，字符串里有 Book 并不会自动赋予机器完整语义。

RDF 的主语可以是 IRI 或空白节点，谓语是 IRI，宾语可以是 IRI、空白节点或字面量。因此“所有节点都用 IRI”不正确。[RDF 1.1 Concepts](https://www.w3.org/TR/rdf11-concepts/)

IRI 提供跨数据集共享标识的基础，却不会自动完成实体消歧：不同 IRI 可能指同一实体。OWL 默认也不假设名字不同就代表个体不同；必要时要明确声明相同或不同关系。[OWL 2 Primer](https://www.w3.org/TR/owl2-primer/#Equality_and_Inequality_of_Individuals)
