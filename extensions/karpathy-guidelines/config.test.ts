import { strict as assert } from "node:assert";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, effectiveThresholds, loadConfig, saveConfig } from "./config.js";

const tmp = mkdtempSync(join(tmpdir(), "karpathy-test-"));
process.env.KARPATHY_CONFIG = join(tmp, "karpathy.json");

after(() => {
	rmSync(tmp, { recursive: true, force: true });
	delete process.env.KARPATHY_CONFIG;
});

describe("loadConfig", () => {
	it("文件不存在时返回默认值", () => {
		// KARPATHY_CONFIG 指向尚不存在的路径。
		const c = loadConfig();
		assert.deepEqual(c, DEFAULT_CONFIG);
	});
	it("用户配置与默认值合并", () => {
		writeFileSync(process.env.KARPATHY_CONFIG!, JSON.stringify({ strictness: "high" }));
		const c = loadConfig();
		assert.equal(c.strictness, "high");
		assert.equal(c.maxLinesPerEdit, DEFAULT_CONFIG.maxLinesPerEdit);
	});
	it("JSON 损坏时回退到默认值", () => {
		writeFileSync(process.env.KARPATHY_CONFIG!, "{ not valid json");
		const c = loadConfig();
		assert.deepEqual(c, DEFAULT_CONFIG);
	});
});

describe("effectiveThresholds", () => {
	it("low 严格度把阈值调大", () => {
		const t = effectiveThresholds({
			...DEFAULT_CONFIG,
			strictness: "low",
			maxLinesPerEdit: 100,
			maxNewAbstractions: 2,
		});
		assert.equal(t.maxLines, 150);
		assert.equal(t.maxAbs, 3);
	});
	it("high 严格度把阈值调小", () => {
		const t = effectiveThresholds({
			...DEFAULT_CONFIG,
			strictness: "high",
			maxLinesPerEdit: 100,
			maxNewAbstractions: 2,
		});
		assert.equal(t.maxLines, 60);
		assert.equal(t.maxAbs, 1);
	});
	it("maxAbs 最小为 1", () => {
		const t = effectiveThresholds({
			...DEFAULT_CONFIG,
			strictness: "high",
			maxNewAbstractions: 0,
		});
		assert.equal(t.maxAbs, 1);
	});
});

describe("saveConfig", () => {
	it("写出合法 JSON，loadConfig 能读回", () => {
		const target = { ...DEFAULT_CONFIG, strictness: "low" as const };
		saveConfig(target);
		const loaded = loadConfig();
		assert.equal(loaded.strictness, "low");
	});
});
