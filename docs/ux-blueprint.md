# Quiz.app UX Blueprint

## 1) User Flow (step-by-step)
1. User lands on auth screen and signs up or logs in.
2. User enters home dashboard and sees streak + XP + quick navigation.
3. User browses quiz categories, filters quizzes, and selects one.
4. User starts quiz, answers MCQs with timer + progress bar visible.
5. User submits or auto-submits on timeout.
6. User sees instant score + per-question correctness feedback.
7. User navigates to history to view past attempts and score trends.
8. Optional: user enters creator mode to build and publish quiz content.

## 2) Key Pages/Screens
- Auth (`login/signup`): single-card minimal form, low friction.
- Browse (`categories + quiz cards`): filter pills and action-focused cards.
- Quiz Play (`question list`): timer, progress bar, clear answer states.
- Results (`instant feedback`): score card + correction details.
- History (`attempt list`): date, quiz title, and score snapshots.
- Creator (optional): form wizard for title, category, questions, answers.

## 3) Engagement Best Practices
- Timer: visible countdown to add urgency, but avoid aggressive penalties.
- Progress bar: gives control and reduces dropout.
- Instant feedback: correctness + explanation placeholder improves learning.
- Micro-rewards: XP, streak badges, and milestone prompts.
- Consistent CTA placement: start, submit, next quiz always predictable.
- Empty states: prompt first action ("Take your first quiz").

## 4) Interactive/Addictive Mechanics (practical)
- Daily streak challenge and "today's featured quiz".
- XP ladder with level-ups every fixed score threshold.
- "Beat your best" per quiz card showing previous top score.
- Light celebratory motion on perfect score and streak continuation.
- Smart reminders: suggest category based on recent attempts.
- Social-lite: share score card image (future iteration).

## 5) Implementation Notes (React + Node + Tailwind)
- Frontend: single-state app to keep flow simple and fast to iterate.
- Backend: lightweight in-memory Express API for auth/quizzes/attempts.
- Tailwind: utility-first classes for consistent modern UI and rapid edits.
- Next production step: replace memory store with PostgreSQL + JWT auth.
