"use client";

/**
 * study_os command menu (local addition, 2026-11-16). Typing "/" in the message
 * box lists the aide's commands with what each does; picking one replaces the
 * draft with its opening words. Pure UI: no model call until the message is sent.
 */
import type { KeyboardEvent } from "react";

export interface StudyCommand {
	name: string;
	label: string;
	description: string;
	/** What the message box holds after picking the command. */
	template: string;
}

export const STUDY_COMMANDS: readonly StudyCommand[] = [
	{ name: "study", label: "Study a chapter", description: "Finds the chapter's textbook, splits it into 2–3 page chunks, then waits for you.", template: "Study: " },
	{ name: "check", label: "Check my blank page", description: "AirDrop a photo of your page (or type the key lines). Questions you on the gaps, hint first.", template: "Check my blank page: pp. " },
	{ name: "doubt", label: "Doubt", description: "Something doesn't make sense. Asks what you think first, then explains.", template: "Doubt: " },
	{ name: "explain", label: "Just explain", description: "A direct explanation, no questions first.", template: "Just explain: " },
	{ name: "quiz", label: "Quiz me", description: "A few board or BITSAT-level questions on a topic, marked strictly.", template: "Quiz me on: " },
	{ name: "bitsat", label: "BITSAT extras", description: "What BITSAT asks beyond NCERT for a chapter, then a short MCQ quiz.", template: "BITSAT extras: " },
	{ name: "debrief", label: "Debrief", description: "Go through questions you got wrong. You diagnose first, then it fixes.", template: "Debrief: " },
	{ name: "recall", label: "Recall a chapter", description: "Spaced recall: blank page of an earlier chapter, then the gaps and your weak points.", template: "Recall: " },
	{ name: "log", label: "My log", description: "Your open weak points and which chapters are due for recall.", template: "Show my weak points and what's due for recall." },
];

/** The commands matching a draft that is still a bare "/word", or null when the menu is closed. */
export function matchingCommands(draft: string): StudyCommand[] | null {
	const match = /^\/(\w*)$/.exec(draft.trim() === "/" ? "/" : draft);
	if (!match) return null;
	const query = match[1]!.toLowerCase();
	// Command-name matches first, then commands whose label has a word starting with the query.
	const byName = STUDY_COMMANDS.filter((command) => command.name.startsWith(query));
	const byLabel = STUDY_COMMANDS.filter((command) => !byName.includes(command)
		&& command.label.toLowerCase().split(/\W+/).some((word) => word.startsWith(query)));
	return [...byName, ...byLabel];
}

/** Keyboard handling while the menu is open. Returns true when the key was used. */
export function handleMenuKey(
	event: KeyboardEvent,
	commands: StudyCommand[],
	active: number,
	setActive: (index: number) => void,
	choose: (command: StudyCommand) => void,
	close: () => void,
): boolean {
	if (commands.length === 0) return false;
	if (event.key === "ArrowDown" || event.key === "ArrowUp") {
		const step = event.key === "ArrowDown" ? 1 : -1;
		setActive((active + step + commands.length) % commands.length);
	} else if (event.key === "Enter" || event.key === "Tab") {
		choose(commands[Math.min(active, commands.length - 1)]!);
	} else if (event.key === "Escape") {
		close();
	} else {
		return false;
	}
	event.preventDefault();
	event.stopPropagation();
	return true;
}

export function StudyCommandMenu({ commands, active, onChoose, onHover }: {
	commands: StudyCommand[];
	active: number;
	onChoose: (command: StudyCommand) => void;
	onHover: (index: number) => void;
}) {
	if (commands.length === 0) return null;
	return (
		<div
			role="listbox"
			aria-label="Study commands"
			data-testid="study-command-menu"
			className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
		>
			<div className="border-b border-border px-3 py-1.5 font-ui text-[11px] uppercase tracking-wide text-muted-foreground">
				Commands · ↑↓ to move · Enter to pick · Esc to close
			</div>
			{commands.map((command, index) => (
				<button
					key={command.name}
					type="button"
					role="option"
					aria-selected={index === active}
					onMouseDown={(event) => { event.preventDefault(); onChoose(command); }}
					onMouseEnter={() => onHover(index)}
					className={`flex w-full items-baseline gap-3 px-3 py-2 text-left ${index === active ? "bg-accent" : "hover:bg-accent/60"}`}
				>
					<span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">/{command.name}</span>
					<span className="min-w-0">
						<span className="block text-sm text-foreground">{command.label}</span>
						<span className="block text-xs text-muted-foreground">{command.description}</span>
					</span>
				</button>
			))}
		</div>
	);
}
