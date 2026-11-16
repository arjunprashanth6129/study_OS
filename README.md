# study_os

A rigorous, agentic study system built for the intense syllabus and studies of an Indian high schooler (CBSE Class 12 boards and BITSAT).

It is inspired by [learnharness](https://github.com/amosblomqvist/learnharness), but uses a different method: the AI does not teach you the chapter or write your notes. You do the work; the AI acts as your examiner.

## The idea: you build it, the tutor breaks it

Re-reading and highlighting feel productive but are among the weakest ways to study. Recalling from memory, spacing it over days, and explaining *why* are among the strongest. So in study_os:

- **You** read the textbook, decide what matters, and make your own notes by hand.
- **The tutor** reads the same chapter so it knows exactly what is in it, then tests what you produced, finds the gaps, and makes you fill them.
- It never tells you what is important before you have tried. It asks questions instead of giving answers, gives a hint before an answer, and reveals the full answer only after a second miss.

## A study session

| Part | Share of time | Where | What happens |
|---|---|---|---|
| 1. NCERT learning | 40% | In the app | The chunk loop below, chapter by chapter |
| 2. Questions | 60% | Outside the app | Your teachers' worksheets and past papers, notes closed (find past papers with [pyq agent](https://github.com/arjunprashanth6129/pyq-agent)) |
| 3. BITSAT extras | Extra | Back in the same session | The tutor teaches what BITSAT asks beyond NCERT, then quizzes you with BITSAT-level multiple-choice questions |

### The chunk loop (Part 1)

The chapter is cut into chunks of 2–3 textbook pages (2 when the pages are dense with derivations, mechanisms or formulas).

1. **Read and note.** You read the pages and make your own notes, timed.
2. **Blank page.** Book and notes closed, you write everything you remember, then send a photo of the page (or type the key lines).
3. **Interrogation.** The tutor compares your page with the textbook and asks 3–5 questions:
   - **gap questions** about what you left out, worded so they don't give the answer away;
   - **why questions** about the reasoning behind a result, a derivation step or a mechanism;
   - **one twist**, the same idea in a new situation.
4. **Hints, then answers.** A miss gets a hint and a second try; the full answer comes only after a second miss.
5. **Fix your notes.** You add corrections to your own notes in a second colour.

At the end of the chapter you write the whole chapter on one page from memory, then your own summary sheet, which the tutor audits.

### What it tests, by subject

| Subject | Focus |
|---|---|
| Physics | Understanding and applying each concept; every derivation step by step from memory |
| Mathematics | Key formulas and results exactly; the approach to each type of question |
| Chemistry | The small facts (exceptions, conditions, reagents, named reactions); mechanisms step by step; the reasoning behind trends |

### Around the sessions

- **Warm-up:** each study session starts with 5 minutes on weak points from earlier chapters.
- **Recall sessions:** a blank-page rewrite of a chapter on day 1, 3, 7, 21 and 45 after studying it.
- **Debrief:** bring the questions you got wrong; you diagnose the mistake first, then the tutor confirms and fixes it.
- **Doubts:** the tutor asks what you currently think, then explains from there (or explains directly if you say "just explain").

## Built-in tools

- **Step timer.** Every step runs on an on-screen countdown that chimes when time is up and asks whether you're done ("Done → next" or "+5 min"). The tutor tracks your real pace and rescales the remaining chunks.
- **Photo pickup.** Write on paper, AirDrop the photo to the Mac, type "done", and the tutor reads your handwriting. iPhone HEIC photos are converted automatically.
- **Study log.** Weak points and spaced-recall dates are kept across sessions, so warm-ups and recall sessions test what you actually got wrong.

## Run it

Requires Node.js and npm.

```bash
npm install
npm run plugins:setup
npm run dev                   # development, http://localhost:3000
npm run build && npm start    # production build
```

Then:

1. In Settings, connect a model provider (for example the Claude Code CLI, a ChatGPT sign-in, or an API key) and choose your models.
2. Install the tutor's instructions: copy `study-system/prompts/` to `data/prompts/` and switch each one on in Settings → Agent → Prompts.
3. Set Settings → Agent → quizzing to free recall.

Your chats, study log and study history stay on your machine in `data/`, which is kept out of git.

## Credit and license

Based on the open-source [learnharness](https://github.com/amosblomqvist/learnharness) by Amos Blomqvist, which is licensed under AGPL-3.0.
