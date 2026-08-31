/**
 * 检查 npm 上是否有新版本可用。
 * 在 session_start(startup) 时异步检查，有更新则注入一条自定义消息到聊天记录中。
 * 消息位于聊天区域（欢迎 widget 上方），可随滚动消失，非常驻。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NPM_REGISTRY_URL =
	"https://registry.npmjs.org/andrej-karpathy-extension/latest";
const CHECK_TIMEOUT_MS = 10_000;
const UPDATE_MESSAGE_TYPE = "karpathy/update-available";

/** 简单的 semver 比较 */
function isNewer(latest: string, current: string): boolean {
	const parse = (v: string): [number, number, number] => {
		const parts = v.replace(/^v/, "").split(".").map(Number);
		return [
			isNaN(parts[0] ?? 0) ? 0 : (parts[0] ?? 0),
			isNaN(parts[1] ?? 0) ? 0 : (parts[1] ?? 0),
			isNaN(parts[2] ?? 0) ? 0 : (parts[2] ?? 0),
		];
	};
	const [la, lb, lc] = parse(latest);
	const [ca, cb, cc] = parse(current);
	if (la !== ca) return la > ca;
	if (lb !== cb) return lb > cb;
	return lc > cc;
}

export function registerUpdateChecker(pi: ExtensionAPI): void {
	pi.on("session_start", async (event) => {
		if (event.reason !== "startup") return;

		// 读取当前版本
		let currentVersion: string | undefined;
		try {
			const __dirname = dirname(fileURLToPath(import.meta.url));
			const pkgPath = join(__dirname, "..", "..", "package.json");
			if (existsSync(pkgPath)) {
				const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
				currentVersion = typeof pkg.version === "string" ? pkg.version : undefined;
			}
		} catch {}

		if (!currentVersion) return;

		// 异步 fetch 最新版本
		let latestVersion: string | undefined;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
		try {
			const res = await fetch(NPM_REGISTRY_URL, {
				headers: { accept: "application/json" },
				signal: controller.signal,
			});
			if (res.ok) {
				const data = (await res.json()) as { version?: unknown };
				latestVersion =
					typeof data.version === "string" ? data.version.trim() : undefined;
			}
		} catch {
		} finally {
			clearTimeout(timeout);
		}

		if (!latestVersion || !isNewer(latestVersion, currentVersion)) return;

		const content =
			`⚠ Update Available\n` +
			`  New version ${latestVersion} is available. Run pi update npm:andrej-karpathy-extension\n` +
			`  Changelog: https://github.com/deerxiaohui-hash/andrej-karpathy-extension/releases`;

		pi.sendMessage(
			{
				customType: UPDATE_MESSAGE_TYPE,
				content,
				display: true,
			},
			{ triggerTurn: false },
		);
	});
}
