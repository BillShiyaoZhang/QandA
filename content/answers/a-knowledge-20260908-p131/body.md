_本次整理（2026-09-08），非原对话逐字回答。_

可以把它分成**解析 JSON、验证请求、从允许的函数映射中分派调用**三步。JSON 只是数据；让它对应哪段代码，应由程序明确决定。

下面的示例保留原问的 `args` 列表格式，只允许调用 `multiply`。把原问中的 JSON 存为 `call.json`，再运行这段 Python：

```python
import json

def multiply(a: int, b: int) -> int:
    return a * b

ALLOWED = {"multiply": multiply}

def unique_object(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise ValueError("JSON 对象有重复键")
        obj[key] = value
    return obj

def call_from_json(raw):
    if len(raw) > 4096:
        raise ValueError("请求过大")
    data = json.loads(raw, object_pairs_hook=unique_object)
    if type(data) is not dict or set(data) != {"action", "args"}:
        raise ValueError("只允许 action 和 args 字段")
    action = data["action"]
    if type(action) is not str or action not in ALLOWED:
        raise ValueError("不允许的函数")
    parts = data["args"]
    if type(parts) is not list or len(parts) != 2:
        raise ValueError("args 必须是两个单参数对象的列表")
    kwargs = {}
    for part in parts:
        if type(part) is not dict or len(part) != 1:
            raise ValueError("每项必须只包含一个参数")
        key, value = next(iter(part.items()))
        if key not in {"a", "b"} or key in kwargs:
            raise ValueError("未知参数或重复参数")
        if type(value) is not int or abs(value) > 10**9:
            raise ValueError("参数须为绝对值不超过10^9的整数")
        kwargs[key] = value
    if set(kwargs) != {"a", "b"}:
        raise ValueError("必须提供 a 和 b")
    return ALLOWED[action](**kwargs)

if __name__ == "__main__":
    with open("call.json", "rb") as f:
        raw = f.read(4097)
    print(call_from_json(raw))
```

输出为 `12`。`json.loads` 把 JSON 转成 Python 对象；`object_pairs_hook` 让示例拒绝重复键；最后的 `**kwargs` 把参数字典按名称传给函数，相当于执行 `multiply(a=3, b=4)`。[Python JSON 文档](https://docs.python.org/3/library/json.html)、[关键字参数解包](https://docs.python.org/3/tutorial/controlflow.html#unpacking-argument-lists)

示例中的4096字节文件上限和整数范围是本次整理选择的演示约束，并非 Python 的数值上限。`type(value) is int` 也会拒绝 JSON 的 `true`，避免把布尔值当作整数。未知函数、缺失参数、重复参数和额外字段都会在执行前报错。

不应直接用 `globals()[action]` 或 `eval` 调度外部输入：输入方不应能够挑选程序中任意可见对象。增加其他工具时，应为每个允许函数另配参数结构和业务校验；即使请求来自语言模型，也不能省略验证。
