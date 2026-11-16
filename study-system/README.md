# Study system prompts

The tutor's behaviour lives in prompt overrides that the app reads from `data/prompts/`
(ignored by git because `data/` holds personal study records). This folder is a tracked
copy of those overrides so the study system is versioned with the code.

To install them into a fresh checkout: copy this `prompts/` folder to `data/prompts/`,
then switch each one on in Settings → Agent → Prompts (or set `agent.prompts` in
`data/settings.json`), and set Settings → Agent → quizzing to free recall.
