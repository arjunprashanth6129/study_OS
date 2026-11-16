# study_os

A rigorous, agentic study system built for the intense syllabus and studies of an Indian high schooler.

It is inspired by [learnharness](https://github.com/amosblomqvist/learnharness). It is a different system with a different method, and it is the only system you need to understand and master concepts while remembering key facts and derivations, using scientific study methods.

## Method: Write → Recall → Solve

The ideal time to study a topic should be about roughly 40% of the time spent with the AI tutor and 60% solving questions (refer to my [pyq agent](https://github.com/arjunprashanth6129/pyq-agent) to find questions easily). 

Each chapter is taught in blocks:
1. **Read and mark** the source (your textbook PDF).
2. **Why**: the reasoning behind the idea.
3. **Full note** and a **write list** with margin cues, which you write by hand.
4. **Written recall check**: you recall the block from memory without looking.
5. **Leak repair**: whatever you missed is fixed strictly, then re-asked in the next block.
6. **One-page sheet** at the end of the chapter, then a hand-over with your leak list and question-time rules.

Spaced **Recall** and **Debrief** sessions are scheduled at day 1, 3, 7 and 21. A **Doubt** mode is available on request.

## Run it

Requires Node.js and npm.

```bash
npm install
npm run dev                   # development, http://localhost:3000
npm run build && npm start    # production build
```

Then choose your models in Settings. The tutor behaviour is set by prompt overrides in `data/prompts/`, which are kept out of git along with your chats and study history.

## Credit and license

Built on the open-source learnharness by Amos Blomqvist, which is licensed under AGPL-3.0. See [LICENSE](LICENSE).
