# dsh-usage-monitor

DeepSeek Harness Web GUI 插件：在侧边栏内实时显示 DeepSeek 平台余额与
token 用量。

## 功能

- 余额：调用 DeepSeek 官方 `GET /user/balance` 接口（默认 60s TTL 缓存），
  显示可用余额、充值、赠送，并给出「估算剩余 token」。
- 用量：读取 token-meter 的 provider 用量桶（未缓存输入 / 缓存读 / 缓存写 /
  输出）与实时请求压力，显示当前会话与全部会话合计。
- 上下文占用：显示当前会话 projectedTokens / contextWindow 的占用进度条。
- 估算花费：按可配置价格表（CNY / 1M tokens）估算花费。
- 界面：液态玻璃质感面板，侧边栏展开时停靠在对话列表下方（页脚上方），
  侧边栏收起时回到左上角；悬停平滑向上展开，移出自动收起；
  位置与宽度随侧边栏拖拽实时过渡。

## 安装

插件是一个 cordis 插件包（host + `dsh.client` web 客户端包），安装到
dsh web profile 可解析的位置（如 `$DSH_HOME/profiles/node_modules/`），
然后在 `profiles/web/cordis.patch.yml` 中插入：

```yaml
- insert:
    - id: dsh-usage-monitor
      name: '@deepseek-ai/dsh-usage-monitor'
      config:
        balanceTtlMs: 60000
```

重启 `dsh web`（或依赖 HMR 热加载）后刷新页面。

## 配置

```yaml
config:
  balanceUrl: https://api.deepseek.com/user/balance
  apiKeyEnv: DEEPSEEK_API_KEY      # 凭据引用（与聊天适配器同一把 key）
  balanceTtlMs: 60000              # 余额缓存时长
  balanceTimeoutMs: 8000           # 余额请求超时
  prices:                          # CNY / 每百万 token，第一行用于估算
    - model: deepseek-chat
      input: 2
      cacheRead: 0.5
      output: 8
    - model: deepseek-reasoner
      input: 4
      cacheRead: 1
      output: 16
```

余额需要可用凭据：在 Web 模型页写入 `DEEPSEEK_API_KEY`，或导出同名
环境变量。没有凭据时面板显示提示，用量功能不受影响。

## 数据口径

- 用量桶为 provider 报告值（token-meter 投影），请求压力含当前轮次实时变化。
- 估算花费与「估算剩余」按默认价格行计算，不是账单数字。
- 客户端每 3 秒轮询一次，页面隐藏时暂停；面板上的 ↻ 按钮强制刷新余额。

## 结构

- `lib/index.js` — 主机端插件：注册 `/usage-monitor/state` 与
  `/usage-monitor/balance` 路由，聚合会话用量与余额。
- `dist/client.js` — `dsh.client` web 平台包：注册 `shell.overlay` 槽位，
  渲染面板并轮询数据。
- `package.json` — 声明 `dsh.client.platform: "web"` 与 `./client` 导出，
  使 client-modules 能把该包注入 `window.__DSH_BOOT__`。
