/**
 * Pi Mkaz Alert Extension
 *
 * Plays a bundled or configured sound when the main agent is fully settled.
 * The result determines which sound is used: success, error, or abort.
 *
 * Settings in `.pi/settings.json` or `~/.pi/agent/settings.json` take
 * precedence over the environment variables.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOUNDS = {
	success: join(PACKAGE_DIR, "pi-mkaz-alert-success.wav"),
	error: join(PACKAGE_DIR, "pi-mkaz-alert-error.wav"),
	abort: join(PACKAGE_DIR, "pi-mkaz-alert-abort.wav"),
} as const;

const ENVIRONMENT_SOUNDS = {
	success: "PI_MKAZ_ALERT_SUCCESS",
	error: "PI_MKAZ_ALERT_ERROR",
	abort: "PI_MKAZ_ALERT_ABORT",
} as const;

type Outcome = keyof typeof DEFAULT_SOUNDS;
type Settings = Record<string, unknown>;
type SoundOverride = { value: string; baseDir: string };
type SoundOverrides = Partial<Record<Outcome, SoundOverride>>;

function isSettings(value: unknown): value is Settings {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSettings(path: string): Settings {
	try {
		const settings: unknown = JSON.parse(readFileSync(path, "utf8"));
		return isSettings(settings) ? settings : {};
	} catch {
		return {};
	}
}

function getSoundOverrides(settings: Settings, baseDir: string): SoundOverrides {
	const configured = settings.mkazAlert;
	if (typeof configured === "string" && configured.trim()) {
		return {
			success: { value: configured.trim(), baseDir },
			error: { value: configured.trim(), baseDir },
			abort: { value: configured.trim(), baseDir },
		};
	}
	if (!isSettings(configured)) return {};

	const overrides: SoundOverrides = {};
	for (const outcome of Object.keys(DEFAULT_SOUNDS) as Outcome[]) {
		const value = configured[outcome];
		if (typeof value === "string" && value.trim()) {
			overrides[outcome] = { value: value.trim(), baseDir };
		}
	}
	return overrides;
}

function readSoundOverrides(cwd: string, projectIsTrusted: boolean): SoundOverrides {
	const globalSettingsPath = join(getAgentDir(), "settings.json");
	const overrides = getSoundOverrides(readSettings(globalSettingsPath), dirname(globalSettingsPath));

	if (!projectIsTrusted) return overrides;

	const projectSettingsPath = join(cwd, CONFIG_DIR_NAME, "settings.json");
	return {
		...overrides,
		...getSoundOverrides(readSettings(projectSettingsPath), dirname(projectSettingsPath)),
	};
}

function expandPath(path: string, baseDir: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return join(homedir(), path.slice(2));
	return isAbsolute(path) ? path : join(baseDir, path);
}

function resolveSoundPath(outcome: Outcome, cwd: string, projectIsTrusted: boolean): string | null {
	const settings = readSoundOverrides(cwd, projectIsTrusted);
	const setting = settings[outcome];
	const configured = setting?.value ?? process.env[ENVIRONMENT_SOUNDS[outcome]] ?? process.env.PI_MKAZ_ALERT;

	if (configured) {
		if (configured.toLowerCase() === "bell") return null;
		const configuredPath = expandPath(configured, setting?.baseDir ?? cwd);
		if (existsSync(configuredPath)) return configuredPath;
	}

	return existsSync(DEFAULT_SOUNDS[outcome]) ? DEFAULT_SOUNDS[outcome] : null;
}

function playBell(): void {
	// ASCII BEL — works in most terminals regardless of platform.
	process.stdout.write("\x07");
}

function playFile(path: string): void {
	const onError = () => playBell();
	let command: string;
	let args: string[];

	if (process.platform === "darwin") {
		command = "afplay";
		args = [path];
	} else if (process.platform === "win32") {
		const escapedPath = path.replace(/'/g, "''");
		command = "powershell.exe";
		args = [
			"-NoProfile",
			"-NonInteractive",
			"-ExecutionPolicy",
			"Bypass",
			"-Command",
			`(New-Object System.Media.SoundPlayer '${escapedPath}').PlaySync()`,
		];
	} else {
		command = "paplay";
		args = [path];
	}

	const child = spawn(command, args, {
		detached: true,
		stdio: "ignore",
		windowsHide: true,
	}).on("error", () => {
		if (process.platform !== "darwin" && process.platform !== "win32" && command === "paplay") {
			const fallback = spawn("aplay", [path], {
				detached: true,
				stdio: "ignore",
				windowsHide: true,
			}).on("error", onError);
			fallback.unref();
			return;
		}
		onError();
	});
	child.unref();
}

function outcomeFor(messages: readonly { role: string; stopReason?: string }[]): Outcome {
	const assistant = [...messages].reverse().find((message) => message.role === "assistant");
	if (assistant?.stopReason === "aborted") return "abort";
	if (assistant?.stopReason === "error") return "error";
	return "success";
}

export default function (pi: ExtensionAPI) {
	let outcome: Outcome = "success";

	pi.on("agent_start", () => {
		outcome = "success";
	});

	pi.on("agent_end", (event) => {
		outcome = outcomeFor(event.messages);
	});

	pi.on("agent_settled", (_event, ctx) => {
		// Only notify the primary interactive/RPC session, not print-mode workers.
		if (!ctx.hasUI || !ctx.isIdle()) return;

		const sound = resolveSoundPath(outcome, ctx.cwd, ctx.isProjectTrusted());
		if (sound) {
			playFile(sound);
		} else {
			playBell();
		}
	});
}
