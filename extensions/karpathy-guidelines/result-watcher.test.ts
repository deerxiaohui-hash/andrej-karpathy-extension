/**
 * result watcher 的行为测试。
 *
 * 最要紧的一条是"覆盖已有文件不许误报"：write 的 input.content 是整份文件的
 * 新内容，天真地统计会把文件里原本就有的函数也算成新增。这里用真实的临时
 * 文件把基线快照那条路径跑通。
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import type { EditToolInput, WriteToolInput } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG, type KarpathyConfig } from "./config.js";
import { registerResultWatcher } from "./result-watcher.js";
import { createHarness, functions, type Harness } from "./test-harness.js";

const workDir = mkdtempSync(join(tmpdir(), "karpathy-watcher-"));
let seq = 0;

after(() => {
	rmSync(workDir, { recursive: true, force: true });
});

/** 每个用例用一份新路径：基线是模块级状态，共用路径会串味。 */
function freshPath(): string {
	seq += 1;
	return join(workDir, `case-${seq}.ts`);
}

function setup(overrides: Partial<KarpathyConfig> = {}): Harness {
	const h = createHarness();
	registerResultWatcher(h.pi, { ...DEFAULT_CONFIG, ...overrides });
	return h;
}

/** 走一遍真实顺序：tool_call 拍基线 -> 文件落地 -> tool_result 统计。 */
async function runWrite(h: Harness, path: string, content: string): Promise<unknown[]> {
	const input: WriteToolInput = { path, content };
	await h.fire("tool_call", { toolName: "write", input });
	writeFileSync(path, content, "utf-8");
	return await h.fire("tool_result", {
		toolName: "write",
		input,
		content: [{ type: "text", text: "ok" }],
	});
}

function warningText(results: unknown[]): string {
	assert.equal(results.length, 1, `期望恰好一条警告，实际 ${results.length} 条`);
	const blocks = (results[0] as { content?: { text?: string }[] }).content ?? [];
	return blocks.map((b) => b.text ?? "").join("\n");
}

describe("registerResultWatcher", () => {
	it("配置关闭时一个 handler 都不注册", () => {
		const h = setup({ enableResultWatcher: false });
		assert.deepEqual(h.registeredEvents(), []);
	});

	it("同时监听 tool_call（拍基线）和 tool_result（统计）", () => {
		const h = setup();
		assert.deepEqual(h.registeredEvents(), ["tool_call", "tool_result"]);
	});

	it("新建文件里一次塞 5 个函数会告警", async () => {
		const h = setup();
		const results = await runWrite(h, freshPath(), functions([1, 2, 3, 4, 5]));
		const text = warningText(results);
		assert.match(text, /5 个新的顶层抽象（阈值：2）/);
		assert.match(text, /Simplicity First/);
	});

	it("覆盖已有文件时，原有的声明不算新增", async () => {
		const h = setup();
		const path = freshPath();
		const before = functions([1, 2, 3, 4, 5]);
		writeFileSync(path, before, "utf-8");

		// 只改一个函数体，声明一个没多。（变量别叫 after，会遮住 node:test 的 after）
		const updated = before.replace("return 3;", "return 30;");
		const results = await runWrite(h, path, updated);
		assert.deepEqual(results, [], "覆盖写入不该产生警告");
	});

	it("已有文件上真的多出 4 个声明时才告警，且数量只算增量", async () => {
		const h = setup();
		const path = freshPath();
		const before = functions([1, 2, 3, 4, 5]);
		writeFileSync(path, before, "utf-8");

		const grown = `${before}\n\n${functions([6, 7, 8, 9])}`;
		const text = warningText(await runWrite(h, path, grown));
		assert.match(text, /4 个新的顶层抽象/);
	});

	it("正好到阈值不告警（只有超过才提醒）", async () => {
		const h = setup();
		const results = await runWrite(h, freshPath(), functions([1, 2]));
		assert.deepEqual(results, []);
	});

	it("警告追加在原有 content 之后，不覆盖它", async () => {
		const h = setup();
		const results = await runWrite(h, freshPath(), functions([1, 2, 3]));
		const blocks = (results[0] as { content: { type: string; text: string }[] }).content;
		assert.equal(blocks.length, 2);
		assert.equal(blocks[0]!.text, "ok");
		assert.match(blocks[1]!.text, /Karpathy/);
	});

	it("edit 按 edits[].newText 统计，且不需要基线", async () => {
		const h = setup();
		const input: EditToolInput = {
			path: freshPath(),
			edits: [
				{ oldText: "// a", newText: functions([1, 2]) },
				{ oldText: "// b", newText: functions([3]) },
			],
		};
		const results = await h.fire("tool_result", { toolName: "edit", input, content: [] });
		assert.match(warningText(results), /3 个新的顶层抽象/);
	});

	it("edits 形状不对时安静跳过，不抛错", async () => {
		const h = setup();
		const results = await h.fire("tool_result", {
			toolName: "edit",
			input: { path: freshPath(), edits: "这不是数组" },
			content: [],
		});
		assert.deepEqual(results, []);
	});

	it("不管别的工具", async () => {
		const h = setup();
		const results = await h.fire("tool_result", {
			toolName: "read",
			input: { path: freshPath() },
			content: [{ type: "text", text: functions([1, 2, 3, 4, 5]) }],
		});
		assert.deepEqual(results, []);
	});

	it("基线读不到文件时按空基线处理（宁可多提醒一次）", async () => {
		const h = setup();
		const path = freshPath();
		assert.equal(existsSync(path), false);
		const text = warningText(await runWrite(h, path, functions([1, 2, 3])));
		assert.match(text, /3 个新的顶层抽象/);
	});
});
