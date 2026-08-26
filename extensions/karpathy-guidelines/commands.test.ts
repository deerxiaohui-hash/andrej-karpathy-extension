/**
 * /karma 命令的行为测试。
 *
 * 命令全是只读的，效果只体现在 ctx.ui.notify 的文本里，所以断言都落在
 * 通知内容上。review 子命令要从 session entries 里翻出 toolCall 块，
 * 这里按 pi 真实的条目形状构造夹具。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EditToolInput, WriteToolInput } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./commands.js";
import { DEFAULT_CONFIG, type KarpathyConfig } from "./config.js";
import { allText, createHarness, functions, lines, type Harness } from "./test-harness.js";

function setup(overrides: Partial<KarpathyConfig> = {}): Harness {
	const h = createHarness();
	registerCommands(h.pi, { current: { ...DEFAULT_CONFIG, ...overrides } });
	return h;
}

/** 包一层 assistant 消息条目，把 toolCall 块塞进 review 能找到的位置。 */
function toolCallEntry(name: "write" | "edit", input: WriteToolInput | EditToolInput) {
	return {
		type: "message",
		message: {
			role: "assistant",
			content: [{ type: "toolCall", name, input }],
		},
	};
}

describe("/karma", () => {
	it("无参数时列出四条原则和当前配置", async () => {
		const h = setup();
		await h.runCommand("karma", "");
		const text = allText(h.notices);
		for (const keyword of [
			"Think Before Coding",
			"Simplicity First",
			"Surgical Changes",
			"Goal-Driven Execution",
		]) {
			assert.match(text, new RegExp(keyword), `缺少原则：${keyword}`);
		}
		assert.match(text, /strictness: medium/);
		assert.match(text, /150 行/);
	});

	it("help 列出全部子命令", async () => {
		const h = setup();
		await h.runCommand("karma", "help");
		const text = allText(h.notices);
		for (const sub of ["review", "configure", "help"]) {
			assert.match(text, new RegExp(sub));
		}
	});

	it("configure 显示原始值和换算后的有效值", async () => {
		const h = setup({ strictness: "high" });
		await h.runCommand("karma", "configure");
		const text = allText(h.notices);
		// 150 * 0.6 = 90
		assert.match(text, /maxLinesPerEdit: 150 -> 有效值 90/);
		assert.match(text, /karpathy\.json/);
	});

	it("未知子命令给 warning 而不是静默", async () => {
		const h = setup();
		await h.runCommand("karma", "nonsense");
		assert.equal(h.notices.length, 1);
		assert.equal(h.notices[0]!.level, "warning");
		assert.match(h.notices[0]!.message, /nonsense/);
	});

	it("大小写和多余空格都能识别子命令", async () => {
		const h = setup();
		await h.runCommand("karma", "  HELP  ");
		assert.match(allText(h.notices), /显示本帮助/);
	});

	it("review 在没有改动时说清楚", async () => {
		const h = setup();
		await h.runCommand("karma", "review", { entries: [] });
		assert.match(allText(h.notices), /还没有 write\/edit/);
	});

	it("review 汇总 write 的行数和抽象数", async () => {
		const h = setup();
		const input: WriteToolInput = { path: "src/a.ts", content: functions([1, 2, 3]) };
		await h.runCommand("karma", "review", { entries: [toolCallEntry("write", input)] });
		const text = allText(h.notices);
		assert.match(text, /共审查 1 处改动/);
		assert.match(text, /write src\/a\.ts/);
		assert.match(text, /3 个顶层抽象/);
	});

	it("review 把 edit 的多处替换合起来算", async () => {
		const h = setup();
		const input: EditToolInput = {
			path: "src/b.ts",
			edits: [
				{ oldText: lines(3), newText: lines(2) },
				{ oldText: "x", newText: functions([1, 2]) },
			],
		};
		await h.runCommand("karma", "review", { entries: [toolCallEntry("edit", input)] });
		const text = allText(h.notices);
		// oldText 共 4 行； newText 共 9 行（2 行 + 7 行函数块（含中间空行））。
		assert.match(text, /edit src\/b\.ts/);
		assert.match(text, /\+9\/-4/);
		assert.match(text, /2 个顶层抽象/);
	});

	it("review 超阈值时把具体是哪些抽象列出来", async () => {
		const h = setup();
		const input: WriteToolInput = { path: "src/c.ts", content: functions([1, 2, 3, 4]) };
		await h.runCommand("karma", "review", { entries: [toolCallEntry("write", input)] });
		const text = allText(h.notices);
		assert.match(text, /function `fn1`/);
		assert.match(text, /function `fn4`/);
	});

	it("review 忽略非工具调用的条目", async () => {
		const h = setup();
		const entries = [
			{ type: "message", message: { role: "user", content: [{ type: "text", text: "hi" }] } },
			{ type: "compaction" },
			toolCallEntry("write", { path: "src/d.ts", content: "const a = 1;" }),
		];
		await h.runCommand("karma", "review", { entries });
		const text = allText(h.notices);
		assert.match(text, /共审查 1 处改动/);
		assert.match(text, /src\/d\.ts/);
	});
});
