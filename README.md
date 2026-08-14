# @deepseek-ai/dsh-usage-monitor

DeepSeek Harness Web GUI 插件：在页面右下角浮动面板实时显示
token 用量、上下文占用、全部会话合计、估算花费与 DeepSeek 平台余额。

## 工作原理

- 主机端（lib/index.js）在 `/usage-monitor/state` 提供 JSON：
  - 每个会话的 provider 用量桶（未缓存输入 / 缓存读 / 缓存写 / 输出，
    来自 token-meter 的 `tokenUsage` 投影）与实时请求压力（`tokenMeter.measure`）
  - `contextPressure` 投影的上下文窗口占用（projectedTokens / contextWindow）
  - 全部会话合计与估算花费（默认按 `prices[0]` 计价，CNY / 1M tokens）
  - DeepSeek 余额：GET https://api.deepseek.com/user/balance（默认 60s TTL 缓存，
    用 `DEEPSEEK_API_KEY` 凭据，与聊天适配器同一把 key）
- 客户端（dist/client.js）是一个 `dsh.client` web 平台包，
  注册到 `shell.overlay` 槽位，每 3 秒轮询一次；页面隐藏时自动暂停。
- `/usage-monitor/balance` 强制刷新余额缓存（面板 ↻ 按钮调用）。

## 安装

插件包位于 profiles/node_modules/@deepseek-ai/dsh-usage-monitor，
由 web profile 的 cordis.patch.yml 插入：

```yaml
- insert:
    - id: dsh-usage-monitor
      name: '@deepseek-ai/dsh-usage-monitor'
```

改动 cordis.patch.yml 后重启 `dsh web`（或依赖 HMR 热加载），
然后刷新浏览器页面。

## 配置

```yaml
- id: dsh-usage-monitor
  name: '@deepseek-ai/dsh-usage-monitor'
  config:
    balanceUrl: https://api.deepseek.com/user/balance
    apiKeyEnv: DEEPSEEK_API_KEY
    balanceTtlMs: 60000
    balanceTimeoutMs: 8000
    prices:
      - model: deepseek-chat
        input: 2
        cacheRead: 0.5
        output: 8
      - model: deepseek-reasoner
        input: 4
        cacheRead: 1
        output: 16
```

- `prices` 是 CNY / 每百万 token 的价格表，第一行用于花费与
  「估算剩余 token」的计算（会话线路上不携带路由模型）。
  请按官方定价页 https://api-docs.deepseek.com/quick_start/pricing 校准。
- 余额需要可用凭据：在 Web 模型页写入 `DEEPSEEK_API_KEY`，
  或导出同名环境变量。没有凭据时面板显示提示，其余功能不受影响。

## 数据口径说明

- 用量桶是 provider 报告值（token-meter 投影），请求压力含当前轮次的实时变化。
- 估算花费不是账单数字：默认价格行 + token 用量，仅供参考。
- 「估算剩余」= 可用余额 ÷ 输入单价（默认价格行）。
