# AGENTS.md

Rules for every agent session on this repo. Read this file fully before doing anything else.

## How the work is organised
- `PROJECT.md` is the plan: requirements, architecture, file map and numbered steps. It is written in the first session and changed only when the plan has to change.
- `CHECKPOINT.md` records where the work stands: the steps that are done, the current step, the exact next action and open questions. Rewrite it at every checkpoint and keep it under about 40 lines. Older history lives in the git log.
- A session can end at any moment, for example when credits run out. Any session must be able to continue from `CHECKPOINT.md` alone, without re-reading the whole codebase.

## Start of every session
1. Run `git status`. If there are uncommitted changes you didn't make, stop and report them.
2. Run `git pull --rebase origin main`. If it fails or reports conflicts, stop and report.
3. If `PROJECT.md` doesn't exist, this is the planning session (see below).
   Otherwise, read `CHECKPOINT.md`, then only the parts of `PROJECT.md` and of the code that the current step needs. If the last step was left half-done, finish it or revert it first.

## Planning session (first session only)
1. Read the requirements in the prompt, `docs/Guidelines.pdf` and the existing code.
2. Write `PROJECT.md` with these sections:
   - **Requirements:** the user's spec, copied verbatim.
   - **Guidelines:** a summary of what matters in `Guidelines.pdf`, so later sessions never need to re-read the PDF. Use it to fill gaps in the spec, and say where you did. Where it conflicts with the spec, the spec wins. Log each conflict in `docs/guideline-conflicts.md`: what the guideline says, what we did and why.
   - **Architecture:** the stack, how data flows, and a file map giving each file one line on its purpose.
   - **Plan:** numbered steps. Each must fit in part of one session and have a "done when" line.
   - **Run and test:** the exact commands.
3. Write `CHECKPOINT.md`, commit, push, and stop so the user can review the plan.

## Building
- Work on one step at a time: build it, test it, commit, push, update `CHECKPOINT.md` and push again. Then start the next step.
- Inside a step, commit and push after each meaningful piece of work.
- Work directly on `main`. The repo is used from two computers whose local files don't sync, so GitHub is the only source of truth.
- If a push is rejected, run `git pull --rebase origin main` once. If that conflicts, stop and report.
- Never use `git push --force`, `git reset --hard` or `git clean`, and never rewrite pushed commits. Don't delete files you didn't create unless the plan says to.
- If the plan turns out to be wrong, update `PROJECT.md` and explain why in `CHECKPOINT.md`.
- At the end of a session, tell the user what was done and what comes next.

## Keep the code readable
A human must be able to read and understand the whole codebase, so simple beats clever.
- Write plain JavaScript with no frameworks. Add a library or build step only if `PROJECT.md` lists it, and record each library in `README.md` with its licence and the reason for using it.
- Use few files, each with one clear purpose and a 2–3 line header comment saying what it does. Keep the file map in `PROJECT.md` up to date.
- Write short functions with clear names. Don't add an abstraction until the same code is needed in three places. Comments should explain why, not what.
- Change only what the current step needs. Don't refactor or reformat other code.
- Don't commit build output, `node_modules/` or lockfile churn. The exception is files the app loads directly, such as `editor.bundle.js`: whenever its source changes, rebuild it with `npm run build` and commit it.

## Save credits
- Read only the files and line ranges you need. Never read bundles, `node_modules/`, lockfiles or build output.
- Run the build and tests before each push, not after every edit.
- Don't use subagents or web search unless the step needs them.
- If the session is getting long, don't start anything new. Finish or revert the current step, update `CHECKPOINT.md` and push. A clean stop is better than a half-done feature.

## CHECKPOINT.md format
    # Checkpoint
    Updated: <date>
    Done: steps 1–4
    Current: step 5 – <title>. <what is done, what is not>
    Next action: <the exact first thing the next session should do>
    Open questions: <questions for the user>
    Known issues: <bugs, failing tests>
