/**
 * tool guard 的行为测试。
 *
 * 覆盖 `-p` 模式下看不见的那些分支：确认框的两个答复、非交互降级、
 * 以及 edit 多处替换合并后才超阈值的情况。
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

interface BlockResult {
	block: true;
	reason: string;
}

function asBlock(value: unknown): BlockResult {
	assert.ok(
		typeof value === "object" && value !== null && "block" in value,
		`期望拿到阻断结果，实际是 ${JSON.stringify(value)}`,
	);
	return value as BlockResult;
}

describe("registerToolGuard", () => {
	it("配置关闭时一个 handler 都不注册", () => {
		const h = setup({ enableToolGuard: false });
		assert.deepEqual(h.registeredEvents(), []);
	});

	it("小改动放过，不弹确认框", async () => {
		const h = setup();
		const input: WriteToolInput = { path: "src/small.ts", content: lines(10) };
		const results = await h.fire("tool_call", { toolName: "write", input }, { hasUI: true });
		assert.deepEqual(results, []);
		assert.equal(h.confirms.length, 0);
	});

	it("过大的 write 在交互模式下弹确认框，用户拒绝则阻断", async () => {
		const h = setup();
		const results = await h.fire("tool_call", bigWrite(), {
			hasUI: true,
			confirmAnswer: false,
		});
		assert.equal(results.length, 1);
		const blocked = asBlock(results[0]);
		assert.equal(blocked.block, true);
		assert.match(blocked.reason, /Karpathy tool guard/);

		// 确认框里要说清是哪个文件、多少行、阈值多少。
		assert.equal(h.confirms.length, 1);
		const dialog = h.confirms[0]!;
		assert.match(dialog.title, /Karpathy/);
		assert.match(dialog.message, /201 行/);
		assert.match(dialog.message, /阈值 150/);
		assert.match(dialog.message, /src\/big\.ts/);
	});

	it("用户同意则不阻断，并留下一条确认通知", async () => {
		const h = setup();
		const results = await h.fire("tool_call", bigWrite(), {
			hasUI: true,
			confirmAnswer: true,
		});
		assert.deepEqual(results, []);
		assert.match(allText(h.notices), /ok: write/);
	});

	it("非交互模式只通知不阻断（print 模式下不能卡住 agent）", async () => {
		const h = setup();
		const results = await h.fire("tool_call", bigWrite(), { hasUI: false });
		assert.deepEqual(results, []);
		assert.equal(h.confirms.length, 0);
		assert.equal(h.notices.length, 1);
		assert.equal(h.notices[0]!.level, "warning");
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
		assert.equal(results.length, 1);
		assert.equal(asBlock(results[0]).block, true);
	});

	it("strictness=high 会把行数阈值收紧到 90", async () => {
		const h = setup({ strictness: "high" });
		const input: WriteToolInput = { path: "src/mid.ts", content: lines(100) };
		const results = await h.fire("tool_call", { toolName: "write", input }, { hasUI: true });
		assert.equal(results.length, 1);
		assert.match(h.confirms[0]!.message, /阈值 90/);
	});

	it("不管别的工具", async () => {
		const h = setup();
		const results = await h.fire(
			"tool_call",
			{ toolName: "bash", input: { command: lines(500) } },
			{ hasUI: true },
		);
		assert.deepEqual(results, []);
		assert.equal(h.confirms.length, 0);
	});
});
