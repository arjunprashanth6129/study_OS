# study_os

A rigorous, agentic study system built for the intense syllabus and studies of an Indian high schooler (CBSE Class 12 boards and BITSAT).

It is inspired by [learnharness](https://github.com/amosblomqvist/learnharness), but works differently: it does not teach you the chapter or run your study session. You study; the AI is an aide you call on when you need it.

## The idea: you do the work, the aide checks it

Re-reading and highlighting feel productive but are among the weakest ways to study. Recalling from memory, spacing it over days, and explaining *why* are among the strongest. So in study_os:

- **You** read the textbook, decide what matters, make your own notes by hand, and write blank pages from memory.
- **The aide** does one job when you ask, then waits. When it checks your work it finds the gaps and asks you about them, gives a hint before an answer, and reveals the full answer only after a second miss.

## How to use it

Start a session with **Study: <chapter>**. The aide finds the chapter's textbook PDF, reads it, splits it into chunks of 2–3 pages (2 when the pages are dense with derivations, mechanisms or formulas), and stops. You study the chunks your own way.

When you need help, type **/** in the message box and pick a command:

| Command | What it does |
|---|---|
| /study | Splits a chapter into 2–3 page chunks, then waits |
| /check | Checks your blank page (photo or typed): questions on the gaps, hint first |
| /doubt | Asks what you think first, then explains |
| /explain | A direct explanation |
| /quiz | A few board or BITSAT-level questions on a topic, marked strictly |
| /bitsat | What BITSAT asks beyond NCERT for a chapter, then a short MCQ quiz |
| /debrief | Questions you got wrong: you diagnose first, then it fixes |
| /recall | Spaced recall of an earlier chapter: blank page, then the gaps and your weak points |
| /log | Your open weak points and the chapters due for recall |

Solve your teachers' questions outside the app (find past papers with [pyq agent](https://github.com/arjunprashanth6129/pyq-agent)).

### What it checks, by subject

| Subject | Focus |
|---|---|
| Physics | Understanding and applying each concept; every derivation step by step |
| Mathematics | Key formulas and results exactly; the approach to each type of question |
| Chemistry | The small facts (exceptions, conditions, reagents, named reactions); mechanisms step by step; the reasoning behind trends |

## Built-in tools

- **Photo pickup.** Write on paper, AirDrop the photo to the Mac, type "done", and the aide reads your handwriting. iPhone HEIC photos are converted automatically.
- **Study log.** Weak points and spaced-recall dates (day 1, 3, 7, 21, 45) are kept across sessions, so recall and quizzes test what you actually got wrong.
- **Low usage.** The aide only runs when you ask, bundles its work into as few model requests as possible, and reads only the pages it needs.

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

Based on the open-source [learnharness](https://github.com/amosblomqvist/learnharness) by Amos Blomqvist. study_os is a modified version of it and is licensed under the same license, [AGPL-3.0](LICENSE). See [NOTICE](NOTICE) for what was changed.
