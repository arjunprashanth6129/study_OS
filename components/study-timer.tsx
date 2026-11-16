"use client";

/**
 * study_os step timer (local addition, 2026-11-16). The tutor's start_timer
 * call records its steps and start time; this bar counts the current step
 * down, chimes when it runs out, and asks whether the learner is done.
 * "Done" starts the next step, "+5 min" extends the current one. Progress is
 * kept per timer in localStorage, so a reload keeps the clock. No model calls.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { LhViewMessage } from "@/src/core";

interface TimerStep { label: string; minutes: number }
interface TimerOutput { startedAt: number; steps: TimerStep[] }
interface TimerProgress { step: number; stepStartedAt: number; extraMs: number; finished: boolean }

function latestTimer(messages: readonly LhViewMessage[]): { id: string; output: TimerOutput } | null {
	for (let mi = messages.length - 1; mi >= 0; mi--) {
		const parts = messages[mi]!.parts;
		for (let pi = parts.length - 1; pi >= 0; pi--) {
			const part = parts[pi]!;
			if (part.type !== "tool-start_timer") continue;
			const output = part.output as Partial<TimerOutput> | undefined;
			if (output && typeof output.startedAt === "number" && Array.isArray(output.steps) && output.steps.length > 0 && part.toolCallId) {
				return { id: part.toolCallId, output: output as TimerOutput };
			}
		}
	}
	return null;
}

const storageKey = (id: string) => `study_os.timer.${id}`;

function loadProgress(id: string, output: TimerOutput): TimerProgress {
	try {
		const raw = localStorage.getItem(storageKey(id));
		if (raw) return JSON.parse(raw) as TimerProgress;
	} catch { /* storage unavailable */ }
	return { step: 0, stepStartedAt: output.startedAt, extraMs: 0, finished: false };
}

function saveProgress(id: string, progress: TimerProgress) {
	try { localStorage.setItem(storageKey(id), JSON.stringify(progress)); } catch { /* storage unavailable */ }
}

function chime() {
	try {
		const ctx = new AudioContext();
		[0, 0.35, 0.7].forEach((offset) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.frequency.value = 880;
			gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
			gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.3);
			osc.connect(gain).connect(ctx.destination);
			osc.start(ctx.currentTime + offset);
			osc.stop(ctx.currentTime + offset + 0.32);
		});
		setTimeout(() => void ctx.close(), 1500);
	} catch { /* audio unavailable */ }
}

function format(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}

export function StudyTimer({ messages }: { messages: readonly LhViewMessage[] }) {
	const timer = useMemo(() => latestTimer(messages), [messages]);
	const [progress, setProgress] = useState<TimerProgress | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const chimedFor = useRef<string | null>(null);

	useEffect(() => {
		setProgress(timer ? loadProgress(timer.id, timer.output) : null);
	}, [timer]);

	useEffect(() => {
		if (!timer || !progress || progress.finished) return;
		const interval = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(interval);
	}, [timer, progress]);

	const step = timer && progress && !progress.finished ? timer.output.steps[progress.step] : undefined;
	const remaining = step && progress ? progress.stepStartedAt + step.minutes * 60_000 + progress.extraMs - now : 0;
	const overdue = !!step && remaining <= 0;
	const chimeKey = timer && progress ? `${timer.id}:${progress.step}:${progress.extraMs}` : null;

	useEffect(() => {
		if (overdue && chimeKey && chimedFor.current !== chimeKey) {
			chimedFor.current = chimeKey;
			chime();
		}
	}, [overdue, chimeKey]);

	useEffect(() => {
		if (!overdue || !step) return;
		const original = document.title;
		document.title = `⏰ Time's up · ${step.label}`;
		return () => { document.title = original; };
	}, [overdue, step]);

	if (!timer || !progress || progress.finished || !step) return null;

	const update = (next: TimerProgress) => { setProgress(next); saveProgress(timer.id, next); };
	const done = () => {
		const nextStep = progress.step + 1;
		update(nextStep < timer.output.steps.length
			? { step: nextStep, stepStartedAt: Date.now(), extraMs: 0, finished: false }
			: { ...progress, finished: true });
	};
	const extend = () => update({ ...progress, extraMs: progress.extraMs + 5 * 60_000 });
	const next = timer.output.steps[progress.step + 1];
	const stepCount = timer.output.steps.length;

	return (
		<div
			data-testid="study-timer"
			role="timer"
			aria-live="polite"
			className={`mx-auto mb-2 flex w-full max-w-[46rem] items-center gap-3 rounded-xl border px-4 py-2 text-sm ${overdue ? "border-amber-500/70 bg-amber-500/10" : "border-border bg-card"}`}
		>
			<span className="font-mono text-base tabular-nums">{overdue ? "0:00" : format(remaining)}</span>
			<span className="min-w-0 flex-1 truncate">
				{overdue ? <strong>Time's up. Done with “{step.label}”?</strong> : step.label}
				{stepCount > 1 && <span className="ml-2 text-xs text-muted-foreground">step {progress.step + 1} of {stepCount}{next ? ` · next: ${next.label} (${next.minutes} min)` : ""}</span>}
			</span>
			<button type="button" onClick={extend} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">+5 min</button>
			<button type="button" onClick={done} className={`rounded-md px-3 py-1 text-xs ${overdue ? "bg-amber-500 text-black" : "border border-border hover:bg-muted"}`}>
				{next ? "Done → next" : "Done"}
			</button>
		</div>
	);
}
