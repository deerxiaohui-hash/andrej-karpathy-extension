/**
 * index.ts 的启动欢迎行为测试。
 *
 * TUI 模式下欢迎语走 setWidget（常驻 aboveEditor），
 * 非 TUI 模式退回一次性 notify——两种模式都只应触发一次。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import karpathyGuidelinesExtension from "./index.js";
import { createHarness } from "./test-harness.js";

// 指向不存在的配置文件，确保 factory 读到 DEFAULT_CONFIG，不受开发者本机配置影响。
process.env.KARPATHY_CONFIG = "./does-not-exist-karpathy-test.json";

/** 装载扩展并触发 session_start(startup)。 */
async function start(h: ReturnType<typeof createHarness>, mode = "tui") {
	await h.fire("session_start", { type: "session_start", reason: "startup" }, { mode });
}

describe("启动欢迎", () => {
	it("TUI 模式：setWidget 设置常驻 widget 在输入框上方", async () => {
		const h = createHarness();
		karpathyGuidelinesExtension(h.pi);

		await start(h, "tui");

		assert.equal(h.widgets.length, 1, "应恰好调用一次 setWidget");
		const w = h.widgets[0]!;
		assert.equal(w.key, "karpathy-welcome");
		assert.equal(w.options?.placement, "aboveEditor");
		// 三行：题头 / 四条短名 / 命令入口
		assert.equal(w.content.length, 3);
		assert.match(w.content[0]!, /──.*Karpathy.*Coding Guidelines/);
		assert.match(w.content[1]!, /先想后做.*简单优先.*外科手术式修改.*目标驱动执行/);
		assert.match(w.content[2]!, /\/karma.*\/karma configure/);
		// TUI 模式不应该再发 notify（避免重复）
		assert.equal(h.notices.length, 0);
	});

	it("非 TUI 模式（print/RPC）：退回一次性 notify", async () => {
		const h = createHarness();
		karpathyGuidelinesExtension(h.pi);

		await start(h, "print");

		assert.equal(h.widgets.length, 0, "print 模式不应调 setWidget");
		assert.equal(h.notices.length, 1);
		assert.match(h.notices[0]!.message, /Karpathy.*Coding Guidelines/);
		assert.match(h.notices[0]!.message, /先想后做.*简单优先/);
		assert.equal(h.notices[0]!.level, "info");
	});

	it("/resume 或 /new 触发的 session_start 也应设置常驻 widget", async () => {
		const h = createHarness();
		karpathyGuidelinesExtension(h.pi);

		await h.fire("session_start", { type: "session_start", reason: "resume" }, { mode: "tui" });

		assert.equal(h.widgets.length, 1, "resume 原因下应调用一次 setWidget");
		assert.equal(h.widgets[0]!.key, "karpathy-welcome");
		assert.equal(h.widgets[0]!.options?.placement, "aboveEditor");
		assert.equal(h.notices.length, 0, "TUI 模式下不应发 notify");
	});

	it("/new 触发的 session_start 也应设置常驻 widget", async () => {
		const h = createHarness();
		karpathyGuidelinesExtension(h.pi);

		await h.fire("session_start", { type: "session_start", reason: "new" }, { mode: "tui" });

		assert.equal(h.widgets.length, 1, "new 原因下应调用一次 setWidget");
		assert.equal(h.widgets[0]!.key, "karpathy-welcome");
		assert.equal(h.notices.length, 0);
	});

	it("扩展加载不会因为缺少 config 文件而崩溃", () => {
		// KARPATHY_CONFIG 指向不存在的文件，loadConfig 应回退到默认值。
		const h = createHarness();
		assert.doesNotThrow(() => karpathyGuidelinesExtension(h.pi));
		// 应注册了全部事件：before_agent_start, tool_call, tool_result, session_start
		const events = h.registeredEvents();
		assert.ok(events.includes("before_agent_start"));
		assert.ok(events.includes("session_start"));
	});
});
