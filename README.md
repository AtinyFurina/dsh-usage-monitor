# @deepseek-ai/dsh-usage-monitor

DeepSeek Harness Web GUI 插件：在侧边栏内实时显示 DeepSeek 平台余额与
token 用量，并从本地持久化会话日志统计真实的历史用量。

## 功能

- 余额：调用 DeepSeek 官方 `GET /user/balance`（默认 60s TTL 缓存），
  显示可用余额、充值、赠送，并按官方价格折算剩余 token。
- 实时用量：读取 token-meter 的 provider 用量桶（未缓存输入 / 缓存读 /
  缓存写 / 输出）与当前会话请求压力、上下文占用。
- 历史累计：从 `ctx.sessionPersistence` 读取所有持久化会话日志，折叠
  provider 上报的真实用量（含未加载的历史会话），无启发式估算。
- 费用：按 DeepSeek 官方 CNY 价目表（deepseek-v4-flash / v4-pro，
  含 2026-08-17 生效的峰谷计费，北京时间 9:00-12:00、14:00-18:00 为高峰）
  逐样本计价；缓存写按未命中价。
- 界面：液态玻璃质感面板，侧边栏展开时停靠在对话列表下方（页脚上方），
  侧边栏收起时回到左上角；悬停平滑向上展开，移出延迟收起；
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
        historyTtlMs: 60000
```

改动后重启 `dsh web`（web profile 中 cordis HMR 默认禁用），刷新页面。
`dist/client.js` 的改动可被 client-hmr 热更新，无需重启。

## 配置

```yaml
config:
  balanceUrl: https://api.deepseek.com/user/balance
  apiKeyEnv: DEEPSEEK_API_KEY   # 凭据引用（与聊天适配器同一把 key）
  balanceTtlMs: 60000           # 余额缓存时长
  balanceTimeoutMs: 8000        # 余额请求超时
  historyTtlMs: 60000           # 历史日志折叠缓存时长
  peakWindowsBeijing: [[9, 12], [14, 18]]  # 峰谷计费高峰时段（北京时间）
  peakEffectiveAt: "2026-08-16T16:00:00Z" # 峰谷价生效时刻
```

余额需要可用凭据：在 Web 模型页写入 `DEEPSEEK_API_KEY`，或导出同名
环境变量。没有凭据时面板显示提示，用量功能不受影响。

## 数据口径

- 用量桶与历史累计均为 provider 报告值（token-meter 投影 / 持久化日志折叠）。
- 费用按官方价目表逐样本计价（含峰谷时段），但账单以平台实际扣费为准。
- 「折算剩余」= 可用余额 ÷ 当前时段未命中输入单价，仅为余额到 token 的换算。
- 客户端每 3 秒轮询，页面隐藏时暂停；面板 ↻ 按钮强制刷新余额。

## 结构

- `lib/index.js` — 主机端插件：注册 `/usage-monitor/state` 与
  `/usage-monitor/balance` 路由，聚合实时会话用量、持久化历史与余额。
- `dist/client.js` — `dsh.client` web 平台包：注册 `shell.overlay` 槽位，
  渲染面板并轮询数据。
- `package.json` — 声明 `dsh.client.platform: "web"` 与 `./client` 导出，
  使 client-modules 把该包注入 `window.__DSH_BOOT__`。
