window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-usage-monitor",
	factory: function (require) {
		"use strict";
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");
		var Primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		var createElement = React.createElement;
		var useState = React.useState;
		var useEffect = React.useEffect;
		var useLayoutEffect = React.useLayoutEffect;
		var useRef = React.useRef;

		var StateDot = Primitives.StateDot;
		var Button = Primitives.Button;
		var IconRefresh = Primitives.IconRefreshOutline14;

		var STATE_PATH = "/usage-monitor/state";
		var FORCE_PATH = "/usage-monitor/balance";
		var POLL_MS = 3000;
		var PLUGIN_ID = "@deepseek-ai/dsh-usage-monitor";

		// HUD rules: the panel never intercepts clicks except on its own two
		// buttons (pointer-events pass through everywhere else), starts
		// collapsed, auto-collapses on outside click, and shifts right of the
		// 56px rail when the sidebar is collapsed.
		var CSS = [
			".dsum-card{position:absolute;left:14px;top:17px;width:200px;box-sizing:border-box;",
			"background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.02) 34%,rgba(255,255,255,0) 64%),",
			"var(--dsw-alias-bg-layer-2,#1e2128);",
			"color:var(--dsw-alias-label-primary,#e8eaed);",
			"border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));border-radius:14px;",
			"box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 8px 24px rgba(0,0,0,.3);",
			"font-family:inherit;overflow:hidden;user-select:none;",
			"backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);",
			"transition:left .32s cubic-bezier(.22,.9,.26,1),top .38s cubic-bezier(.22,.9,.26,1),",
			"width .32s cubic-bezier(.22,.9,.26,1),box-shadow .35s ease,backdrop-filter .35s ease}",
			".dsum-card:hover{box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 12px 36px rgba(0,0,0,.45);",
			"backdrop-filter:blur(26px) saturate(195%);",
			"-webkit-backdrop-filter:blur(26px) saturate(195%)}",
			".dsum-clip{display:grid;grid-template-rows:0fr;opacity:0;transform:translateY(-4px);",
			"transition:grid-template-rows .38s cubic-bezier(.22,.9,.26,1),opacity .28s ease,transform .38s cubic-bezier(.22,.9,.26,1)}",
			".dsum-card.dsum-open .dsum-clip{grid-template-rows:1fr;opacity:1;transform:none}",
			".dsum-clip-inner{min-height:0;overflow:hidden}",
			".dsum-head{position:relative;display:flex;align-items:center;gap:6px;height:34px;padding:0 2px 0 10px}",
			".dsum-title{font-size:14px;line-height:20px;font-weight:500;white-space:nowrap}",
			".dsum-headline{margin-left:auto;font-size:12px;line-height:17px;white-space:nowrap;",
			"color:var(--dsw-alias-label-secondary,rgba(232,234,237,.62));font-variant-numeric:tabular-nums}",
			".dsum-btn{pointer-events:auto}",
			".dsum-body{padding:2px 10px 10px;border-top:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.07))}",
			".dsum-section{padding:7px 0 3px;display:flex;flex-direction:column;gap:4px}",
			".dsum-hero{display:flex;justify-content:space-between;align-items:baseline;gap:8px}",
			".dsum-hero-label{font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary,rgba(232,234,237,.62))}",
			".dsum-hero-value{font-size:16px;line-height:22px;font-weight:600;font-variant-numeric:tabular-nums}",
			".dsum-caption{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,rgba(232,234,237,.45))}",
			".dsum-title-line{font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary,rgba(232,234,237,.62));",
			"text-overflow:ellipsis;white-space:nowrap;overflow:hidden}",
			".dsum-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px}",
			".dsum-line{display:flex;justify-content:space-between;gap:10px;font-size:12px;line-height:17px;",
			"font-variant-numeric:tabular-nums}",
			".dsum-line span:first-child{color:var(--dsw-alias-label-secondary,rgba(232,234,237,.62))}",
			".dsum-line span:last-child{text-align:right;color:var(--dsw-alias-label-primary,#e8eaed)}",
			".dsum-cell{min-width:0;display:flex;flex-direction:column;gap:1px;padding:4px 6px;border-radius:8px;",
			"background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.04))}",
			".dsum-cell-label{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary,rgba(232,234,237,.45))}",
			".dsum-cell-value{font-size:13px;line-height:18px;font-weight:500;font-variant-numeric:tabular-nums;",
			"text-overflow:ellipsis;white-space:nowrap;overflow:hidden}",
			".dsum-bar-wrap{height:4px;border-radius:2px;background:var(--dsw-alias-border-l2,rgba(255,255,255,.09));",
			"overflow:hidden;margin:2px 0 0}",
			".dsum-bar{height:100%;border-radius:2px;background:var(--dsw-alias-brand-primary,#4d9fff);",
			"transition:width .35s ease}",
			".dsum-bar.dsum-warn{background:var(--dsw-alias-state-warn-primary,#e8b04d)}",
			".dsum-footer{display:flex;justify-content:space-between;gap:8px;padding-top:6px;",
			"font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,rgba(232,234,237,.45));",
			"font-variant-numeric:tabular-nums}",
			".dsum-error{color:var(--dsw-alias-state-error-primary,#e06c6c);font-size:11px;line-height:16px;",
			"white-space:pre-wrap;word-break:break-all;padding-top:4px}"
		].join("");

		function injectStyle() {
			var tag = document.createElement("style");
			tag.dataset.plugin = PLUGIN_ID;
			tag.dataset.pluginCss = PLUGIN_ID + "/panel.css";
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		function fmtTokens(n) {
			if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
			var v = Number(n);
			if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
			if (v >= 1e4) return (v / 1e3).toFixed(1) + "k";
			return String(Math.round(v));
		}

		function fmtMoney(n) {
			if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
			return Number(n).toFixed(2);
		}

		function fmtTime(ts) {
			if (!ts) return "—";
			var d = new Date(ts);
			var p = function (x) { return String(x).padStart(2, "0"); };
			return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
		}

		function usageInputTokens(u) {
			if (!u) return null;
			return (u.uncachedInputTokens || 0) + (u.cacheReadTokens || 0) + (u.cacheWriteTokens || 0);
		}

		function cell(label, value) {
			return createElement("div", { className: "dsum-cell" },
				createElement("span", { className: "dsum-cell-label" }, label),
				createElement("span", { className: "dsum-cell-value" }, value));
		}

		function line(label, value, valueClass) {
			return createElement("div", { className: "dsum-line" },
				createElement("span", null, label),
				createElement("span", { className: valueClass || undefined }, value));
		}

		function Panel(props) {
			var useSessions = props.useSessions;
			var currentId = useSessions(function (s) { return s.current; });
			var clientTitle = useSessions(function (s) {
				var cur = s.current;
				if (cur === undefined) return undefined;
				var entry = s.byId[cur];
				return entry ? entry.title : undefined;
			});

			var dataRef = useRef(null);
			var errorRef = useRef(null);
			var intervalRef = useRef(null);
			var busyRef = useRef(false);

			var [data, setData] = useState(null);
			var [error, setError] = useState(null);
			var [collapsed, setCollapsed] = useState(true);
			var [pos, setPos] = useState({ left: 14, top: 17, width: 200 });
			var clipRef = useRef(null);
			var collapsedRef = useRef(true);
			var leaveTimer = useRef(null);

			var applyData = function (payload) {
				dataRef.current = payload;
				setData(payload);
			};

			var refresh = function (force) {
				if (busyRef.current) return;
				busyRef.current = true;
				var path = force ? FORCE_PATH : STATE_PATH;
				fetch(path, { cache: "no-store" })
					.then(function (res) {
						if (!res.ok) throw new Error("HTTP " + res.status);
						return res.json();
					})
					.then(function (payload) {
						errorRef.current = null;
						setError(null);
						if (payload && payload.ok) applyData(payload);
						else if (payload && payload.error) {
							errorRef.current = payload.error;
							setError(payload.error);
						}
					})
					.catch(function (err) {
						errorRef.current = err instanceof Error ? err.message : String(err);
						setError(errorRef.current);
					})
					.finally(function () { busyRef.current = false; });
			};

			// Dock the panel: below the conversation list, just above the sidebar
			// footer, when the sidebar is wide; back to the top-left chip when
			// the sidebar collapses to the rail. left/top/width animate via CSS.
			var measurePosition = function () {
				var layer = document.querySelector("[data-shell-overlay]");
				var frame = layer && layer.parentElement;
				var rail = !!(frame && frame.hasAttribute("data-sidebar-collapsed"));
				var next;
				if (rail) {
					next = { left: 68, top: 17, width: 200 };
				} else {
					var side = document.querySelector(".hHd-Xa_root");
					var foot = document.querySelector(".hHd-Xa_footArea");
					if (side) {
						var r = side.getBoundingClientRect();
						var footH = foot ? foot.getBoundingClientRect().height : 44;
						var bodyH = clipRef.current ? clipRef.current.scrollHeight : 0;
						var totalH = 34 + (collapsedRef.current ? 0 : bodyH) + 2;
						next = {
							left: Math.round(r.left) + 15,
							top: Math.round(r.bottom - 6 - footH - 8 - totalH),
							width: Math.round(r.width) - 28
						};
					} else {
						next = { left: 14, top: 17, width: 200 };
					}
				}
				setPos(function (prev) {
					if (prev.left === next.left && prev.top === next.top && prev.width === next.width) return prev;
					return next;
				});
			};

			useLayoutEffect(function () {
				collapsedRef.current = collapsed;
				measurePosition();
			}, [collapsed]);

			useEffect(function () {
				refresh(false);
				measurePosition();
				var start = function () {
					if (intervalRef.current !== null) return;
					intervalRef.current = setInterval(function () {
						if (document.hidden) return;
						measurePosition();
						refresh(false);
					}, POLL_MS);
				};
				var stop = function () {
					if (intervalRef.current !== null) {
						clearInterval(intervalRef.current);
						intervalRef.current = null;
					}
				};
				start();
				var onVis = function () {
					if (document.hidden) stop();
					else {
						refresh(false);
						start();
					}
				};
				var onResize = function () { measurePosition(); };
				document.addEventListener("visibilitychange", onVis);
				window.addEventListener("resize", onResize);

				// Follow sidebar drags and footer changes live.
				var observers = [];
				var observe = function (sel) {
					var el = document.querySelector(sel);
					if (!el) return;
					var ro = new ResizeObserver(function () { measurePosition(); });
					ro.observe(el);
					observers.push(ro);
				};
				observe(".hHd-Xa_root");
				observe(".hHd-Xa_footArea");

				return function () {
					stop();
					if (leaveTimer.current !== null) clearTimeout(leaveTimer.current);
					document.removeEventListener("visibilitychange", onVis);
					window.removeEventListener("resize", onResize);
					for (var i = 0; i < observers.length; i++) observers[i].disconnect();
				};
			}, []);

			var payload = data;
			var current = null;
			var rows = payload && Array.isArray(payload.sessions) ? payload.sessions : [];
			for (var i = 0; i < rows.length; i++) {
				if (rows[i].id === currentId) { current = rows[i]; break; }
			}

			var usage = current ? current.usage : null;
			var pressure = current ? current.pressure : null;
			var totals = payload ? payload.totals : null;
			var balance = payload ? payload.balance : null;
			var balanceError = payload ? payload.balanceError : null;
			var history = payload ? payload.history : null;
			var historyError = payload ? payload.historyError : null;
			var displayError = error || balanceError || historyError || null;

			var histTotalTokens = history
				? (history.uncachedInputTokens || 0) + (history.cacheReadTokens || 0) + (history.cacheWriteTokens || 0) + (history.outputTokens || 0)
				: null;
			var histInput = history
				? (history.uncachedInputTokens || 0) + (history.cacheReadTokens || 0) + (history.cacheWriteTokens || 0)
				: null;

			var occupancy = null;
			var remainingContext = null;
			if (pressure && pressure.contextWindow && pressure.projectedTokens !== undefined) {
				occupancy = Math.min(100, Math.max(0, pressure.projectedTokens / pressure.contextWindow * 100));
				remainingContext = Math.max(0, pressure.contextWindow - pressure.projectedTokens);
			}

			var title = current && current.title ? current.title : clientTitle;
			var headlineBalance = balance ? "¥" + fmtMoney(balance.totalBalance) : "—";
			var headlineTokens = fmtTokens(current ? current.totalTokens : null);

			var body = createElement("div", { className: "dsum-body" },
				createElement("div", { className: "dsum-section" },
						createElement("div", { className: "dsum-hero" },
							createElement("span", { className: "dsum-hero-label" }, "可用余额"),
							createElement("span", { className: "dsum-hero-value" }, balance ? "¥" + fmtMoney(balance.totalBalance) : "—")
						),
						createElement("div", { className: "dsum-caption" },
							"充值 ¥" + fmtMoney(balance ? balance.toppedUpBalance : null) +
							" · 赠送 ¥" + fmtMoney(balance ? balance.grantedBalance : null) +
							" · 折算剩余 " + fmtTokens(payload ? payload.remainingTokensEstimate : null))
					),
					createElement("div", { className: "dsum-section" },
						createElement("div", { className: "dsum-title-line" }, title === undefined ? "当前会话" : String(title)),
						createElement("div", { className: "dsum-grid" },
							cell("输入", fmtTokens(usageInputTokens(usage))),
							cell("输出", fmtTokens(usage ? usage.outputTokens : null)),
							cell("压力", fmtTokens(current ? current.totalTokens : null))
						),
						occupancy === null ? null : createElement("div", null,
							createElement("div", { className: "dsum-bar-wrap" },
								createElement("div", {
									className: "dsum-bar" + (occupancy > 85 ? " dsum-warn" : ""),
									style: { width: occupancy.toFixed(1) + "%" }
								})),
							createElement("div", { className: "dsum-caption" },
								"上下文 " + occupancy.toFixed(0) + "% · 剩余 " + fmtTokens(remainingContext))
						)
					),
					createElement("div", { className: "dsum-section" },
						createElement("div", { className: "dsum-section-title" }, "历史累计 · 真实日志"),
						createElement("div", { className: "dsum-grid" },
							cell("会话数", history ? String(history.sessions) : "—"),
							cell("Token 合计", fmtTokens(histTotalTokens)),
							cell("累计费用", "¥" + fmtMoney(history ? history.costCny : null))
						),
						line("输入 / 输出", fmtTokens(histInput) + " / " + fmtTokens(history ? history.outputTokens : null))
					),
					createElement("div", { className: "dsum-footer" },
						createElement("span", null, "更新 " + fmtTime(payload ? payload.now : null)),
						createElement("span", null, "官方价目表 · CNY")
					),
					displayError ? createElement("div", { className: "dsum-error" }, String(displayError)) : null
			);

			return createElement("div", {
				className: "dsum-card" + (collapsed ? "" : " dsum-open"),
				style: {
					left: pos.left + "px",
					top: pos.top + "px",
					width: pos.width + "px"
				},
				onMouseEnter: function () {
					if (leaveTimer.current !== null) {
						clearTimeout(leaveTimer.current);
						leaveTimer.current = null;
					}
					setCollapsed(false);
				},
				onMouseLeave: function () {
					if (leaveTimer.current !== null) clearTimeout(leaveTimer.current);
					leaveTimer.current = setTimeout(function () {
						leaveTimer.current = null;
						setCollapsed(true);
					}, 150);
				},
				children: [
					createElement("div", {
						className: "dsum-head",
						children: [
							createElement(StateDot, { state: "ongoing", size: 10 }),
							createElement("span", { className: "dsum-title" }, "余额 / 用量"),
							createElement("span", { className: "dsum-headline" }, headlineBalance + " · " + headlineTokens),
							createElement("span", { className: "dsum-btn" },
								createElement(Button, {
									size: "sm",
									variant: "ghost",
									icon: createElement(IconRefresh, {}),
									"aria-label": "刷新余额",
									title: "刷新余额",
									onClick: function () { refresh(true); }
								})
							)
						]
					}),
					createElement("div", { className: "dsum-clip" },
						createElement("div", { className: "dsum-clip-inner", ref: clipRef },
							body
						)
					)
				]
			});
		}

		function apply(ctx) {
			injectStyle();
			ctx.effect(function () {
				var dispose = ctx.slots.register({
					name: "shell.overlay",
					id: "usage-monitor",
					order: 999,
					label: "余额 / 用量"
				}, Panel);
				return dispose;
			}, "usage-monitor: overlay panel");
		}

		exports.name = "usage-monitor";
		exports.inject = ["slots"];
		exports.apply = apply;
		return module.exports;
	}
});
