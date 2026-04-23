export const sanitizeQuizForList = (quiz) => ({
  id: quiz.id || quiz._id?.toString?.() || quiz._id,
  _id: quiz._id?.toString?.() || quiz._id || quiz.id,
  title: quiz.title,
  category: quiz.category,
  description: quiz.description,
  questionCount: quiz.questions.length,
  createdBy: quiz.createdBy,
  createdAt: quiz.createdAt,
  updatedAt: quiz.updatedAt,
});

export const sanitizeQuizForPlayer = (quiz) => ({
  ...sanitizeQuizForList(quiz),
  questions: quiz.questions.map((question) => ({
    id: question.id || question._id?.toString?.() || question._id,
    _id: question._id?.toString?.() || question._id || question.id,
    text: question.text,
    kind: question.kind || "mcq",
    options: question.options ?? [],
  })),
});
