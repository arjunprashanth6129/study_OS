/**
 * study_os study tools (local addition, 2026-11-16): the step timer, the
 * cross-session weak-point log with spaced-recall dates, and photo pickup
 * for handwritten pages. All local; none of them makes a model call.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { PATHS } from "../../../config.ts";
import type { ChatStore } from "../../core/ports.ts";
import { detectSupportedImageMimeType, processImage } from "../image-processing/index.ts";
import { serverExecute, type ImageFileResult } from "../tool-execute.ts";

const run = promisify(execFile);

// ─── step timer ──────────────────────────────────────────────────────────────

export const START_TIMER_TOOL = "start_timer";

const timerInput = Type.Object({
	steps: Type.Array(
		Type.Object({
			label: Type.String({ minLength: 1, description: "What the learner does in this step, e.g. 'Read and note pp. 4–6'." }),
			minutes: Type.Integer({ minimum: 1, maximum: 240, description: "Minutes for this step." }),
		}),
		{ minItems: 1, maxItems: 6, description: "The steps in order. The first starts now; each next one starts when the learner marks the previous one done." },
	),
});

export interface TimerStep { label: string; minutes: number }
export interface TimerOutput {
	startedAt: number;
	steps: TimerStep[];
	now: string;
	sessionMinutes: number;
	previous: { steps: string; plannedMinutes: number; actualMinutes: number } | null;
}

function localTime(ms: number): string {
	return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** The latest earlier start_timer call in this session and its recorded start. */
function previousTimer(store: ChatStore, chatId: string): { steps: TimerStep[]; startedAt: number } | null {
	const record = store.getChat(chatId);
	if (!record) return null;
	for (let i = record.messages.length - 1; i >= 0; i--) {
		const message = record.messages[i] as { role?: string; toolName?: string; details?: unknown };
		if (message.role !== "toolResult" || message.toolName !== START_TIMER_TOOL) continue;
		const details = message.details as Partial<TimerOutput> | null;
		if (details && typeof details.startedAt === "number" && Array.isArray(details.steps)) return { steps: details.steps, startedAt: details.startedAt };
	}
	return null;
}

export function timerResult(steps: TimerStep[], now: number, sessionStart: number | null, previous: { steps: TimerStep[]; startedAt: number } | null): TimerOutput {
	return {
		startedAt: now,
		steps,
		now: localTime(now),
		sessionMinutes: sessionStart === null ? 0 : Math.max(0, Math.round((now - sessionStart) / 60_000)),
		previous: previous
			? {
				steps: previous.steps.map((s) => `${s.label} (${s.minutes} min)`).join(", "),
				plannedMinutes: previous.steps.reduce((sum, s) => sum + s.minutes, 0),
				actualMinutes: Math.max(0, Math.round((now - previous.startedAt) / 60_000)),
			}
			: null,
	};
}

export function createStartTimerTool(ctx: { chatId: string; chatStore: ChatStore }): AgentTool<typeof timerInput> {
	return {
		name: START_TIMER_TOOL,
		label: START_TIMER_TOOL,
		description:
			"Start the learner's on-screen countdown for the next step(s) of work. The first step starts now; when a step's time is up the learner hears a chime and is asked whether they are done, and marking it done starts the next step. " +
			"The result tells you the current time, minutes since the session began, and how long the previous timer's steps actually took compared with the plan. Call it before you write the message that sets the work, so you can mention the timing.",
		parameters: timerInput,
		execute: serverExecute(START_TIMER_TOOL, timerInput, ({ steps }) => {
			const record = ctx.chatStore.getChat(ctx.chatId);
			const sessionStart = record?.createdAt ? Date.parse(record.createdAt) : null;
			return timerResult(steps, Date.now(), Number.isFinite(sessionStart) ? sessionStart : null, previousTimer(ctx.chatStore, ctx.chatId));
		}),
	};
}

// ─── weak-point log and spaced recall ────────────────────────────────────────

export const RECALL_OFFSETS_DAYS = [1, 3, 7, 21, 45];

interface WeakPoint { id: string; chapter: string; subject: string; point: string; addedAt: string; lastSeenAt: string; times: number; fixedAt?: string }
interface ChapterRecord { chapter: string; subject: string; sessions: string[] }
interface StudyLog { version: 1; points: WeakPoint[]; chapters: ChapterRecord[] }

export const studyLogPath = { current: path.join(PATHS.data, "study", "log.json") };

function readLog(): StudyLog {
	try {
		const parsed = JSON.parse(fs.readFileSync(studyLogPath.current, "utf8")) as Partial<StudyLog>;
		return { version: 1, points: Array.isArray(parsed.points) ? parsed.points : [], chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [] };
	} catch {
		return { version: 1, points: [], chapters: [] };
	}
}

function writeLog(log: StudyLog): void {
	fs.mkdirSync(path.dirname(studyLogPath.current), { recursive: true });
	const temp = `${studyLogPath.current}.${process.pid}.tmp`;
	fs.writeFileSync(temp, JSON.stringify(log, null, "\t"));
	fs.renameSync(temp, studyLogPath.current);
}

function day(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(isoDay: string, days: number): string {
	const [y, m, d] = isoDay.split("-").map(Number);
	return day(new Date(y!, m! - 1, d! + days).getTime());
}

const sameChapter = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Next recall date: the first session plus the offset for the number of recalls already done. */
export function nextRecall(chapter: ChapterRecord): string | null {
	const first = chapter.sessions[0];
	if (!first) return null;
	const done = chapter.sessions.length - 1;
	const offset = RECALL_OFFSETS_DAYS[Math.min(done, RECALL_OFFSETS_DAYS.length - 1)]!;
	const dueBy = addDays(first, offset);
	const last = chapter.sessions[chapter.sessions.length - 1]!;
	return dueBy > last ? dueBy : addDays(last, 30);
}

const readInput = Type.Object({
	chapter: Type.Optional(Type.String({ description: "Only this chapter's weak points. Omit for every open weak point across chapters." })),
});
const addInput = Type.Object({
	chapter: Type.String({ minLength: 1 }),
	subject: Type.String({ minLength: 1, description: "Physics, Chemistry, Maths or Economics." }),
	points: Type.Array(Type.String({ minLength: 1, description: "One specific weak point, e.g. 'forgot that reverse saturation current is due to minority carriers'." }), { minItems: 1, maxItems: 20 }),
});
const fixedInput = Type.Object({ ids: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 40 }) });
const studiedInput = Type.Object({ chapter: Type.String({ minLength: 1 }), subject: Type.String({ minLength: 1 }) });

export function createStudyLogTools(): Record<string, AgentTool<any>> {
	return {
		study_log_read: {
			name: "study_log_read",
			label: "study_log_read",
			description:
				"Read the learner's persistent study log: today's date, open weak points (with ids), and every studied chapter with its next spaced-recall date and whether it is due. Use it at the start of a session for the warm-up and to know what is due.",
			parameters: readInput,
			execute: serverExecute("study_log_read", readInput, ({ chapter }) => {
				const log = readLog();
				const today = day(Date.now());
				const open = log.points.filter((p) => !p.fixedAt && (!chapter || sameChapter(p.chapter, chapter)))
					.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, 40)
					.map((p) => ({ id: p.id, chapter: p.chapter, subject: p.subject, point: p.point, times: p.times, lastSeen: p.lastSeenAt.slice(0, 10) }));
				const chapters = log.chapters.map((c) => {
					const next = nextRecall(c);
					return { chapter: c.chapter, subject: c.subject, studied: c.sessions, nextRecall: next, due: next !== null && next <= today };
				});
				return { today, openWeakPoints: open, chapters };
			}),
		},
		weak_points_add: {
			name: "weak_points_add",
			label: "weak_points_add",
			description: "Record weak points the learner showed (gaps, errors, things they could not explain) so later sessions can test them again. A point already open for the chapter is counted again instead of duplicated.",
			parameters: addInput,
			execute: serverExecute("weak_points_add", addInput, ({ chapter, subject, points }) => {
				const log = readLog();
				const now = new Date().toISOString();
				let added = 0, repeated = 0;
				for (const point of points) {
					const existing = log.points.find((p) => !p.fixedAt && sameChapter(p.chapter, chapter) && p.point.trim().toLowerCase() === point.trim().toLowerCase());
					if (existing) { existing.times++; existing.lastSeenAt = now; repeated++; continue; }
					log.points.push({ id: `wp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, chapter, subject, point, addedAt: now, lastSeenAt: now, times: 1 });
					added++;
				}
				writeLog(log);
				return `Recorded ${added} new weak point(s), ${repeated} repeat(s), for ${chapter}.`;
			}),
		},
		weak_points_fixed: {
			name: "weak_points_fixed",
			label: "weak_points_fixed",
			description: "Mark weak points as fixed once the learner has recalled them correctly from memory in a later session (not in the same sitting they were repaired).",
			parameters: fixedInput,
			execute: serverExecute("weak_points_fixed", fixedInput, ({ ids }) => {
				const log = readLog();
				const now = new Date().toISOString();
				let fixed = 0;
				for (const p of log.points) if (ids.includes(p.id) && !p.fixedAt) { p.fixedAt = now; fixed++; }
				writeLog(log);
				return `Marked ${fixed} weak point(s) fixed.`;
			}),
		},
		chapter_studied: {
			name: "chapter_studied",
			label: "chapter_studied",
			description: "Record that the learner studied or recalled a chapter today. Returns the next spaced-recall date to give the learner.",
			parameters: studiedInput,
			execute: serverExecute("chapter_studied", studiedInput, ({ chapter, subject }) => {
				const log = readLog();
				const today = day(Date.now());
				let record = log.chapters.find((c) => sameChapter(c.chapter, chapter));
				if (!record) { record = { chapter, subject, sessions: [] }; log.chapters.push(record); }
				if (record.sessions[record.sessions.length - 1] !== today) record.sessions.push(today);
				writeLog(log);
				return { chapter: record.chapter, sessions: record.sessions, nextRecall: nextRecall(record) };
			}),
		},
	};
}

// ─── photo pickup ────────────────────────────────────────────────────────────

const PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);
export const photoFolders = {
	current: () => [path.join(os.homedir(), "Downloads"), path.join(os.homedir(), "Desktop"), path.join(os.homedir(), "Desktop", "Study")],
};

export function recentPhotos(folders: string[], sinceMs: number, max: number): { file: string; mtimeMs: number }[] {
	const found: { file: string; mtimeMs: number }[] = [];
	for (const folder of folders) {
		let names: string[];
		try { names = fs.readdirSync(folder); } catch { continue; }
		for (const name of names) {
			if (!PHOTO_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
			const file = path.join(folder, name);
			try {
				const stat = fs.statSync(file);
				if (stat.isFile() && stat.mtimeMs >= sinceMs) found.push({ file, mtimeMs: stat.mtimeMs });
			} catch { /* vanished */ }
		}
	}
	return found.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, max);
}

const photoInput = Type.Object({
	minutes: Type.Optional(Type.Integer({ minimum: 1, maximum: 240, description: "Look back this many minutes (default 20)." })),
	max: Type.Optional(Type.Integer({ minimum: 1, maximum: 4, description: "At most this many photos, newest first (default 3)." })),
});

export function createLatestPhotoTool(): AgentTool<typeof photoInput> {
	return {
		name: "latest_photo",
		label: "latest_photo",
		description:
			"Look at the learner's newest photos of their handwritten pages (AirDropped or saved to Downloads, Desktop or the Study folder in the last few minutes). Returns the images themselves so you can read the handwriting. Call it when the learner says they have sent or saved a photo.",
		parameters: photoInput,
		execute: serverExecute("latest_photo", photoInput, async ({ minutes, max }): Promise<string | ImageFileResult> => {
			const photos = recentPhotos(photoFolders.current(), Date.now() - (minutes ?? 20) * 60_000, max ?? 3);
			if (photos.length === 0) {
				return `No photo found from the last ${minutes ?? 20} minutes in Downloads, Desktop or the Study folder. Ask the learner to AirDrop the photo to this Mac (it lands in Downloads), or to type the key lines instead.`;
			}
			const images: { data: string; mimeType: string }[] = [];
			const notes: string[] = [];
			for (const photo of photos.reverse()) {
				let file = photo.file;
				let temp: string | null = null;
				try {
					if (/\.(heic|heif)$/i.test(file)) {
						temp = path.join(os.tmpdir(), `study-os-photo-${Date.now()}-${images.length}.jpg`);
						await run("/usr/bin/sips", ["-s", "format", "jpeg", file, "--out", temp]);
						file = temp;
					}
					const bytes = fs.readFileSync(file);
					const mime = detectSupportedImageMimeType(bytes);
					if (!mime) { notes.push(`${path.basename(photo.file)}: not a readable image`); continue; }
					const processed = await processImage(bytes, mime);
					if (!processed.ok) { notes.push(`${path.basename(photo.file)}: ${processed.message}`); continue; }
					images.push({ data: processed.data, mimeType: processed.mimeType });
					notes.push(`${path.basename(photo.file)} (saved ${localTime(photo.mtimeMs)})`);
				} catch (error) {
					notes.push(`${path.basename(photo.file)}: could not be read (${error instanceof Error ? error.message : String(error)})`);
				} finally {
					if (temp) fs.rmSync(temp, { force: true });
				}
			}
			return { text: `Photos, oldest first: ${notes.join("; ")}`, images };
		}),
	};
}
