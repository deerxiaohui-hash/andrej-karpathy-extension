/**
 * tool guard（观察者模式）的行为测试。
 *
 * 观察者只通知、不拦截：任何过大的 write/edit 都变成一条带数字的 warning，
 * 工具调用永远放行，confirm 永远不被调用。误报的代价因此从"打断工作"
 * 降为"多一条信息"。
 *
 * 事件负载用 pi 导出的 WriteToolInput / EditToolInput 标注——pi 哪天改了
 * 工具入参的形状，这里会直接编译不过，而不是默默失效。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EditToolInput, WriteToolInput } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG, type KarpathyConfig } from "./config.js";
import { registerToolGuard } from "./tool-guard.js";
import { allText, createHarness, lines } from "./test-harness.js";

function setup(overrides: Partial<KarpathyConfig> = {}) {
	const h = createHarness();
	registerToolGuard(h.pi, { ...DEFAULT_CONFIG, ...overrides });
	return h;
}

/** 默认阈值 150 行；201 行必然超标。 */
function bigWrite(path = "src/big.ts"): { toolName: "write"; input: WriteToolInput } {
	const input: WriteToolInput = { path, content: lines(201) };
	return { toolName: "write", input };
}

describe("registerToolGuard（观察者模式）", () => {
	it("配置关闭时一个 handler 都不注册", () => {
		const h = setup({ enableToolGuard: false });
		assert.deepEqual(h.registeredEvents(), []);
	});

	it("小改动保持沉默", async () => {
		const h = setup();
		const input: WriteToolInput = { path: "src/small.ts", content: lines(10) };
		const results = await h.fire("tool_call", { toolName: "write", input }, { hasUI: true });
		assert.deepEqual(results, []);
		assert.equal(h.notices.length, 0);
	});

	it("过大的 write 只通知、不拦截，交互模式也不弹确认框", async () => {
		const h = setup();
		const results = await h.fire("tool_call", bigWrite(), { hasUI: true });

		// 观察者永远放行。
		assert.deepEqual(results, []);
		assert.equal(h.confirms.length, 0, "观察者模式不应调用 confirm");

		// 但要留下带数字的通知。
		assert.equal(h.notices.length, 1);
		const notice = h.notices[0]!;
		assert.equal(notice.level, "warning");
		assert.match(notice.message, /write src\/big\.ts/);
		assert.match(notice.message, /201 行（阈值 150）/);
		assert.match(notice.message, /\+201\/-0/);
	});

	it("非交互模式同样只通知", async () => {
		const h = setup();
		const results = await h.fire("tool_call", bigWrite(), { hasUI: false });
		assert.deepEqual(results, []);
		assert.equal(h.notices.length, 1);
	});

	it("纯数据内容也通知——观察者提供信号，不替人判断", async () => {
		const h = setup();
		// 300 行行号文件：没有抽象、没有风险，但规模依然值得看见。
		const input: WriteToolInput = { path: "tmp/big2.txt", content: lines(300) };
		const results = await h.fire("tool_call", { toolName: "write", input }, { hasUI: true });
		assert.deepEqual(results, [], "数据文件也不能被拦");
		assert.equal(h.notices.length, 1);
		assert.match(h.notices[0]!.message, /300 行/);
	});

	it("edit 的多处替换合起来算总规模", async () => {
		const h = setup();
		// 单看每一处都不超阈值，合起来才超。
		const input: EditToolInput = {
			path: "src/x.ts",
			edits: [
				{ oldText: "a", newText: lines(100) },
				{ oldText: "b", newText: lines(100) },
			],
		};
		const results = await h.fire("tool_call", { toolName: "edit", input }, { hasUI: true });
		assert.deepEqual(results, []);
		assert.equal(h.notices.length, 1);
		assert.match(h.notices[0]!.message, /edit src\/x\.ts/);
		// 新增 200 行 + 删除 2 行 = 总规模 202。
		assert.match(h.notices[0]!.message, /202 行/);
		assert.match(h.notices[0]!.message, /\+200\/-2/);
	});

	it("strictness=high 会把行数阈值收紧到 90", async () => {
		const h = setup({ strictness: "high" });
		const input: WriteToolInput = { path: "src/mid.ts", content: lines(100) };
		await h.fire("tool_call", { toolName: "write", input }, { hasUI: true });
		assert.equal(h.notices.length, 1);
		assert.match(h.notices[0]!.message, /阈值 90/);
	});

	it("不管别的工具", async () => {
		const h = setup();
		const results = await h.fire(
			"tool_call",
			{ toolName: "bash", input: { command: lines(500) } },
			{ hasUI: true },
		);
		assert.deepEqual(results, []);
		assert.equal(h.notices.length, 0);
	});

	it("通知文本汇总后能看出规模信号", async () => {
		const h = setup();
		await h.fire("tool_call", bigWrite(), { hasUI: true });
		assert.match(allText(h.notices), /karpathy/);
	});
});
