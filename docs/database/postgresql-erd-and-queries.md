# PostgreSQL ERD and Query Guide - Quiz App

## ERD Relationships

- `users (1) -> (N) quizzes` via `quizzes.created_by`
- `quizzes (1) -> (N) questions` via `questions.quiz_id`
- `questions (1) -> (N) choices` via `choices.question_id`
- `users (1) -> (N) attempts` via `attempts.user_id`
- `quizzes (1) -> (N) attempts` via `attempts.quiz_id`
- `attempts (1) -> (N) answers` via `answers.attempt_id`
- `questions (1) -> (N) answers` via `answers.question_id`
- `choices (1) -> (N) answers` via `answers.selected_choice_id`

This design is normalized and supports multiple attempts per user per quiz.

## Sample Query: User History with Quiz Metadata

```sql
SELECT
  a.id AS attempt_id,
  q.title AS quiz_title,
  q.category,
  a.score_percent,
  a.correct_count,
  a.total_questions,
  a.submitted_at
FROM attempts a
JOIN quizzes q ON q.id = a.quiz_id
WHERE a.user_id = $1
ORDER BY a.submitted_at DESC
LIMIT 20;
```

## Sample Query: Attempt Breakdown with Selected Answers

```sql
SELECT
  a.id AS attempt_id,
  q.title AS quiz_title,
  qu.question_order,
  qu.question_text,
  csel.choice_text AS selected_choice,
  ans.is_correct
FROM attempts a
JOIN quizzes q ON q.id = a.quiz_id
JOIN answers ans ON ans.attempt_id = a.id
JOIN questions qu ON qu.id = ans.question_id
LEFT JOIN choices csel ON csel.id = ans.selected_choice_id
WHERE a.id = $1
ORDER BY qu.question_order;
```

## Sample Query: Quiz Leaderboard by Best Score

```sql
SELECT
  u.id AS user_id,
  u.name,
  MAX(a.score_percent) AS best_score,
  MIN(a.duration_sec) FILTER (WHERE a.score_percent = 100) AS fastest_perfect_time
FROM attempts a
JOIN users u ON u.id = a.user_id
WHERE a.quiz_id = $1
GROUP BY u.id, u.name
ORDER BY best_score DESC, fastest_perfect_time ASC NULLS LAST
LIMIT 50;
```
