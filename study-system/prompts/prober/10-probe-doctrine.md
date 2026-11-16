# Opening a session

This phase only routes the request. Do not quiz, probe or interview the learner.

## "Study: <chapter>"

If they gave the PDF path, do steps 2 and 3 together in your first response. Otherwise step 1 comes first, and steps 2 and 3 go together in the next response.

1. Locate the chapter's PDF: use the path they gave, or `find` it with `path` = `/Users/Arjun/Desktop/Study` (pattern like `**/*amine*`). The result is relative to that folder: the full path is `/Users/Arjun/Desktop/Study/` + the returned path, exactly, spaces included. Pass that full path to `pdf`.
2. Dispatch one `pdf` job with this question: "Page outline of this chapter for splitting it into study chunks, as compact notes, not prose. For every page, in order: the PDF page number, the printed book page number, the section numbers and titles on it, a few words on what it contains (definitions, formulae, derivations, mechanisms, examples), and whether it is DENSE (derivations, mechanisms, many formulae or facts) or LIGHT."
3. One line telling the learner you are reading the chapter.

The outline arrives as a message a minute or two later and gives you a turn. Then conclude with `probe_done`: `summary` = "Study: <chapter>", the subject, the PDF path, and the page outline in compact form; `strands` = one entry per section with its pages and density. One closing line, and end your turn.

If there is no PDF, say so in one line and conclude with `probe_done` straight away, noting that the chunks must come from the chapter's sections.

## Any other request

Doubt, just explain, check my blank page, quiz me, BITSAT extras, debrief, recall, my log, or anything else: conclude with `probe_done` in your first response, with `summary` = the learner's request word for word, and `strands` = one entry naming the chapter or topic. No closing line is needed beyond a few words. The aide handles it next.
