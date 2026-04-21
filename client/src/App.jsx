import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1").replace(/\/+$/, "");
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const VIEWS = { DASHBOARD: "dashboard", BROWSE: "browse", QUIZ_INTRO: "quiz_intro", QUIZ: "quiz", RESULT: "result", HISTORY: "history", CREATE: "create" };

const buildEmptyQuestion = () => ({ text: "", options: ["", "", "", ""], correctOptionIndex: 0 });
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const getQuestionId = (question) => question?.id || question?._id;
const getQuestionKey = (question, index) => getQuestionId(question) || `idx-${index}`;
const getApiErrorMessage = (payload, fallback) => {
  if (!payload || typeof payload !== "object") return fallback;
  const detailed = Array.isArray(payload.error?.details)
    ? payload.error.details
        .map((entry) => entry.msg || entry.message)
        .filter(Boolean)
        .join(" ")
    : "";
  return detailed || payload.error?.message || payload.message || fallback;
};
const readApiPayload = async (response) => {
  try {
    return await response.json();
  } catch {
    try {
      const text = await response.text();
      return { error: { message: text || `Request failed (${response.status})` } };
    } catch {
      return { error: { message: `Request failed (${response.status})` } };
    }
  }
};
const apiRequest = async (path, { method = "GET", token, body, headers = {} } = {}) => {
  const requestHeaders = { ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  const hasBody = body !== undefined;
  if (hasBody && !(body instanceof FormData) && !requestHeaders["Content-Type"]) {
    requestHeaders["Content-Type"] = "application/json";
  }
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: hasBody ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  const payload = await readApiPayload(response);
  if (!response.ok) {
    const error = new Error(getApiErrorMessage(payload, `Request failed (${response.status})`));
    error.status = response.status;
    throw error;
  }
  return payload;
};

const getStreakDays = (attempts) => {
  if (!attempts.length) return 0;
  const uniqueDays = [...new Set(attempts.map((a) => new Date(a.submittedAt).toISOString().slice(0, 10)))].sort().reverse();
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (const day of uniqueDays) {
    if (day !== cursor.toISOString().slice(0, 10)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

function App() {
  const [authMode, setAuthMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("quiz_token") || "");
  const [message, setMessage] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [activeView, setActiveView] = useState(VIEWS.DASHBOARD);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [activeQuiz, setActiveQuiz] = useState(null);

  const [answers, setAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timedMode, setTimedMode] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState(null);

  const [attempts, setAttempts] = useState([]);
  const [dashboard, setDashboard] = useState({ totalAttempts: 0, averageScore: 0, bestScore: 0, recentAttempts: [] });
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [quizLoading, setQuizLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [quizzesRefreshTick, setQuizzesRefreshTick] = useState(0);

  const [createState, setCreateState] = useState({ title: "", category: "", description: "", questions: [buildEmptyQuestion()] });
  const [createMessage, setCreateMessage] = useState("");
  const [quizMessage, setQuizMessage] = useState("");

  const googleBtnRef = useRef(null);

  const submitQuiz = useCallback(async () => {
    if (!activeQuiz) return;
    setSubmitError("");
    setSubmitLoading(true);
    const submissionAnswers = activeQuiz.questions.reduce((acc, question, index) => {
      const questionId = getQuestionId(question);
      const selectedOptionIndex = answers[getQuestionKey(question, index)];
      if (typeof selectedOptionIndex === "number" && question.options[selectedOptionIndex] !== undefined) {
        if (!questionId) return acc;
        acc[questionId] = question.options[selectedOptionIndex];
      }
      return acc;
    }, {});
    const activeQuizId = activeQuiz.id || activeQuiz._id;
    if (!activeQuizId) {
      setSubmitLoading(false);
      return;
    }
    try {
      const data = await apiRequest(`/quizzes/${activeQuizId}/submissions`, {
        method: "POST",
        token,
        body: { answers: submissionAnswers },
      });
      setResult(data);
      setActiveQuiz(null);
      setActiveView(VIEWS.RESULT);
    } catch (error) {
      setSubmitError(error.message || "Unable to submit quiz.");
    } finally {
      setSubmitLoading(false);
    }
  }, [activeQuiz, token, answers]);

  useEffect(() => {
    if (!token || user) return;
    (async () => {
      try {
        const data = await apiRequest("/auth/me", { token });
        setUser(data.user);
      } catch {
        localStorage.removeItem("quiz_token");
        setToken("");
      }
    })();
  }, [token, user]);

  useEffect(() => {
    if (!user) return;
    setBrowseLoading(true);
    setBrowseError("");
    const query = selectedCategory ? `?category=${encodeURIComponent(selectedCategory)}` : "";
    (async () => {
      try {
        const data = await apiRequest(`/quizzes${query}`);
        const playableQuizzes = data.filter((quiz) => (quiz.questionCount || 0) > 0);
        setQuizzes(playableQuizzes);
        setCategories([...new Set(playableQuizzes.map((q) => q.category))]);
      } catch (error) {
        setBrowseError(error.message || "Unable to load quizzes.");
      } finally {
        setBrowseLoading(false);
      }
    })();
  }, [user, selectedCategory, result, quizzesRefreshTick]);

  useEffect(() => {
    if (!user || !token) return;
    setHistoryLoading(true);
    setDashboardLoading(true);
    setHistoryError("");
    setDashboardError("");
    (async () => {
      try {
        const [historyData, dashboardData] = await Promise.all([
          apiRequest("/users/me/history", { token }),
          apiRequest("/users/me/dashboard", { token }),
        ]);
        setAttempts(historyData);
        setDashboard(dashboardData);
      } catch (error) {
        const message = error.message || "Unable to load your data.";
        setHistoryError(message);
        setDashboardError(message);
      } finally {
        setHistoryLoading(false);
        setDashboardLoading(false);
      }
    })();
  }, [user, token, result]);

  useEffect(() => {
    if (!activeQuiz || !timedMode || secondsLeft <= 0) return;
    const timer = setTimeout(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          submitQuiz();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [activeQuiz, timedMode, secondsLeft, submitQuiz]);

  useEffect(() => {
    if (user || !GOOGLE_CLIENT_ID || !googleBtnRef.current) return;
    const initGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            const data = await apiRequest("/auth/google", {
              method: "POST",
              body: { credential: response.credential },
            });
            setUser(data.user);
            setToken(data.token);
            localStorage.setItem("quiz_token", data.token);
            setMessage("");
          } catch (error) {
            setMessage(error.message || "Google login failed.");
          }
        },
      });
      googleBtnRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleBtnRef.current, { theme: "outline", size: "large", shape: "pill", text: authMode === "signup" ? "signup_with" : "signin_with", width: 320 });
    };
    if (window.google?.accounts?.id) return initGoogle();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initGoogle;
    document.body.appendChild(script);
  }, [authMode, user]);

  const progress = useMemo(() => {
    if (!activeQuiz) return 0;
    return Math.round((Object.keys(answers).length / activeQuiz.questions.length) * 100);
  }, [activeQuiz, answers]);

  const streakDays = useMemo(() => getStreakDays(attempts), [attempts]);
  const currentQuestion = activeQuiz?.questions[currentQuestionIndex];

  const handleAuth = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const endpoint = authMode === "signup" ? "/auth/register" : "/auth/login";
      const data = await apiRequest(endpoint, { method: "POST", body: form });
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem("quiz_token", data.token);
      setForm({ name: "", email: "", password: "" });
    } catch (error) {
      setMessage(error.message || "Cannot reach server.");
    }
  };

  const startQuiz = async () => {
    if (!selectedQuiz) return;
    setQuizMessage("");
    if ((selectedQuiz.questionCount || 0) < 1) {
      setQuizMessage("This quiz has no questions yet. Add at least one question in Create before starting.");
      return;
    }
    setQuizLoading(true);
    try {
      const data = await apiRequest(`/quizzes/${selectedQuiz.id}`);
      if (!data.questions?.length) {
        setQuizMessage("This quiz has no playable questions yet.");
        return;
      }
      setActiveQuiz(data);
      setAnswers({});
      setCurrentQuestionIndex(0);
      setSecondsLeft(data.questions.length * 30);
      setActiveView(VIEWS.QUIZ);
    } catch (error) {
      setQuizMessage(error.message || "Unable to load quiz.");
    } finally {
      setQuizLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("quiz_token");
    setToken("");
    setUser(null);
    setActiveQuiz(null);
    setResult(null);
    setSelectedQuiz(null);
  };

  const addQuestion = () => setCreateState((prev) => ({ ...prev, questions: [...prev.questions, buildEmptyQuestion()] }));
  const removeQuestion = (index) => setCreateState((prev) => ({ ...prev, questions: prev.questions.filter((_, idx) => idx !== index) }));
  const updateQuestionField = (index, key, value) => setCreateState((prev) => {
    const next = [...prev.questions];
    next[index] = { ...next[index], [key]: value };
    return { ...prev, questions: next };
  });
  const updateOption = (questionIndex, optionIndex, value) => setCreateState((prev) => {
    const next = [...prev.questions];
    const options = [...next[questionIndex].options];
    options[optionIndex] = value;
    next[questionIndex] = { ...next[questionIndex], options };
    return { ...prev, questions: next };
  });

  const handleCreateQuiz = async (event) => {
    event.preventDefault();
    setCreateMessage("");
    const hasInvalidQuestion = createState.questions.some(
      (q) => !q.text.trim() || q.text.trim().length < 5 || q.options.some((o) => !o.trim()) || q.options[q.correctOptionIndex].trim().length < 1,
    );
    if (!createState.title.trim() || !createState.category.trim() || hasInvalidQuestion) return setCreateMessage("Complete title, category, and all question fields.");
    if (createState.title.trim().length < 3) return setCreateMessage("Quiz title must be at least 3 characters.");
    if (createState.category.trim().length < 2) return setCreateMessage("Category must be at least 2 characters.");
    setCreateLoading(true);
    try {
      const questionsPayload = createState.questions.map((question) => ({
        text: question.text.trim(),
        options: question.options.map((option) => option.trim()),
        correctAnswer: question.options[question.correctOptionIndex].trim(),
      }));

      await apiRequest("/quizzes/with-questions", {
        method: "POST",
        token,
        body: {
          title: createState.title.trim(),
          category: createState.category.trim(),
          description: createState.description.trim(),
          questions: questionsPayload,
        },
      });
      setCreateMessage("Quiz published successfully.");
      setCreateState({ title: "", category: "", description: "", questions: [buildEmptyQuestion()] });
      setQuizzesRefreshTick((prev) => prev + 1);
      setActiveView(VIEWS.BROWSE);
    } catch (error) {
      setCreateMessage(error.message || "Unable to publish now.");
    } finally {
      setCreateLoading(false);
    }
  };

  const renderNavButton = (id, label) => (
    <button
      type="button"
      onClick={() => {
        setActiveView(id);
        setMobileMenuOpen(false);
      }}
      className={`rounded-xl px-3 py-2 text-sm ${activeView === id ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
    >
      {label}
    </button>
  );

  if (!user) {
    return (
      <main className="app-container flex min-h-screen items-center">
        <form onSubmit={handleAuth} className="app-card mx-auto w-full max-w-md space-y-3">
          <div>
            <p className="inline-flex rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">Quiz SaaS</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Quiz.app</h1>
            <p className="mt-1 text-sm text-slate-400">Minimal, professional, dark-mode learning experience.</p>
          </div>
          {authMode === "signup" && <input className="input-base" placeholder="Full name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />}
          <input className="input-base" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required />
          <input className="input-base" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} required />
          {message && <p className="text-xs text-rose-400">{message}</p>}
          <button className="btn-primary w-full">{authMode === "signup" ? "Create account" : "Log in"}</button>
          <div className="flex items-center gap-2"><span className="h-px flex-1 bg-slate-700" /><span className="text-xs text-slate-500">or</span><span className="h-px flex-1 bg-slate-700" /></div>
          {GOOGLE_CLIENT_ID ? <div className="flex justify-center" ref={googleBtnRef} /> : <p className="text-xs text-slate-500">Set `VITE_GOOGLE_CLIENT_ID` for Google sign-in.</p>}
          <button type="button" onClick={() => setAuthMode((prev) => (prev === "signup" ? "login" : "signup"))} className="btn-ghost w-full">
            {authMode === "signup" ? "Have an account? Log in" : "New user? Create account"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="app-container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-500 p-px">
              <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-950 text-xs font-bold">QZ</div>
            </div>
            <div>
              <p className="text-sm font-semibold">Quiz.app</p>
              <p className="text-xs text-slate-500">Modern learning SaaS</p>
            </div>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {renderNavButton(VIEWS.DASHBOARD, "Dashboard")}
            {renderNavButton(VIEWS.BROWSE, "Browse")}
            {renderNavButton(VIEWS.HISTORY, "History")}
            {renderNavButton(VIEWS.CREATE, "Create")}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">Streak {streakDays}</span>
            <button type="button" className="btn-danger" onClick={logout}>Logout</button>
          </div>
          <button type="button" className="btn-ghost md:hidden" onClick={() => setMobileMenuOpen((prev) => !prev)}>Menu</button>
        </div>
        {mobileMenuOpen && (
          <div className="app-container pb-3 md:hidden">
            <div className="app-card flex flex-col gap-2 p-3">
              {renderNavButton(VIEWS.DASHBOARD, "Dashboard")}
              {renderNavButton(VIEWS.BROWSE, "Browse")}
              {renderNavButton(VIEWS.HISTORY, "History")}
              {renderNavButton(VIEWS.CREATE, "Create")}
              <button type="button" className="btn-danger w-full" onClick={logout}>Logout</button>
            </div>
          </div>
        )}
      </header>

      <main className="app-container space-y-4 py-6 md:space-y-6">
        {activeView === VIEWS.DASHBOARD && (
          <section className="space-y-4 md:space-y-6">
            {dashboardLoading && <p className="text-sm text-slate-400">Loading dashboard...</p>}
            {dashboardError && <p className="text-sm text-rose-400">{dashboardError}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Quizzes Taken", value: dashboard.totalAttempts || 0 },
                { label: "Average Score", value: `${dashboard.averageScore || 0}%` },
                { label: "Best Score", value: `${dashboard.bestScore || 0}%` },
                { label: "Current Streak", value: `${streakDays} days` },
              ].map((stat) => (
                <article key={stat.label} className="app-card p-4">
                  <p className="meta-label">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
                </article>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <article className="app-card lg:col-span-2">
                <h2 className="text-2xl font-semibold">Performance</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <p className="meta-label">Category Focus</p>
                    <p className="mt-1 text-sm text-slate-300">Tech and Science are your strongest categories.</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <p className="meta-label">Improvement Goal</p>
                    <p className="mt-1 text-sm text-slate-300">Reach 80% average this week to unlock the Expert badge.</p>
                  </div>
                </div>
              </article>
              <article className="app-card relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-cyan-500/10" />
                <div className="relative">
                  <h3 className="text-lg font-semibold">Daily Challenge</h3>
                  <p className="mt-2 text-sm text-slate-300">Complete one quiz today for bonus XP and streak protection.</p>
                  <button type="button" className="btn-primary mt-4 w-full" onClick={() => setActiveView(VIEWS.BROWSE)}>Start Challenge</button>
                </div>
              </article>
            </div>
            <article className="app-card">
              <h3 className="text-lg font-semibold">Recent History</h3>
              <div className="mt-4 space-y-2">
                {attempts.length === 0 && <p className="text-sm text-slate-500">No attempts yet.</p>}
                {attempts.slice(0, 6).map((attempt) => (
                  <div key={attempt._id || attempt.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{attempt.quizTitle}</p>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${attempt.scorePercent >= 60 ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
                          {attempt.scorePercent >= 60 ? "Pass" : "Needs Retry"}
                        </span>
                        <span className="text-sm text-indigo-300">{attempt.scorePercent}%</span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{new Date(attempt.submittedAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}

        {activeView === VIEWS.BROWSE && (
          <section className="space-y-4">
            {browseLoading && <p className="text-sm text-slate-400">Loading quizzes...</p>}
            {browseError && <p className="text-sm text-rose-400">{browseError}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedCategory("")} className={`rounded-full px-3 py-1 text-xs font-medium ${selectedCategory === "" ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30" : "bg-slate-800 text-slate-300"}`}>All</button>
              {categories.map((category) => (
                <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={`rounded-full px-3 py-1 text-xs font-medium ${selectedCategory === category ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30" : "bg-slate-800 text-slate-300"}`}>
                  {category}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {quizzes.map((quiz) => (
                <article key={quiz.id} className="app-card-interactive group">
                  <span className="inline-flex rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">{quiz.category}</span>
                  <h3 className="mt-2 text-lg font-semibold">{quiz.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-400">{quiz.description || "Challenge yourself with this quiz."}</p>
                  <p className="mt-3 text-sm text-slate-400">{quiz.questionCount} questions • {Math.max(1, Math.round(quiz.questionCount / 2))} min</p>
                  <button type="button" onClick={() => { setSelectedQuiz(quiz); setActiveView(VIEWS.QUIZ_INTRO); }} className="btn-primary mt-4 w-full">View Quiz</button>
                </article>
              ))}
            </div>
            {!browseLoading && quizzes.length === 0 && (
              <article className="app-card">
                <h3 className="text-lg font-semibold">No playable quizzes yet</h3>
                <p className="mt-2 text-sm text-slate-400">Create a quiz and add at least one question to make it appear here.</p>
                <button type="button" className="btn-primary mt-4" onClick={() => setActiveView(VIEWS.CREATE)}>Go to Create</button>
              </article>
            )}
          </section>
        )}

        {activeView === VIEWS.QUIZ_INTRO && selectedQuiz && (
          <section className="app-card relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-cyan-500/10" />
            <div className="relative space-y-4">
              <h2 className="text-2xl font-semibold">{selectedQuiz.title}</h2>
              <p className="text-sm text-slate-300">{selectedQuiz.description || "No description provided."}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">Category: {selectedQuiz.category}</div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">Questions: {selectedQuiz.questionCount}</div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">Estimated: {selectedQuiz.questionCount * 30}s</div>
              </div>
              {quizMessage && <p className="text-sm text-amber-300">{quizMessage}</p>}
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={timedMode} onChange={(e) => setTimedMode(e.target.checked)} />
                Timed mode
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn-primary w-full sm:w-auto disabled:opacity-50" onClick={startQuiz} disabled={quizLoading || (selectedQuiz.questionCount || 0) < 1}>
                  {quizLoading ? "Loading..." : "Start Quiz"}
                </button>
                <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setActiveView(VIEWS.BROWSE)}>Back</button>
              </div>
            </div>
          </section>
        )}

        {activeView === VIEWS.QUIZ && activeQuiz && currentQuestion && (
          <section className="mx-auto max-w-3xl space-y-4">
            <div className="app-card">
              <div className="mb-3 flex items-center justify-between text-sm">
                <p className="text-slate-400">{activeQuiz.title}</p>
                <p className="text-indigo-300">{timedMode ? formatTime(secondsLeft) : "Practice Mode"}</p>
              </div>
              <div className="h-2 rounded-full bg-slate-800">
                <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Question {currentQuestionIndex + 1} of {activeQuiz.questions.length}</p>
            </div>

            <div className="app-card">
              <h3 className="text-lg font-semibold">{currentQuestion.text}</h3>
              <div className="mt-4 grid gap-2">
                {currentQuestion.options.map((option, optionIndex) => {
                  const currentQuestionKey = getQuestionKey(currentQuestion, currentQuestionIndex);
                  return (
                  <button
                    key={`${currentQuestionKey}-${optionIndex}`}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [currentQuestionKey]: optionIndex }))}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${answers[currentQuestionKey] === optionIndex ? "border-indigo-500 bg-indigo-500/15 text-indigo-200" : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500"}`}
                  >
                    {option}
                  </button>
                  );
                })}
              </div>
            </div>

            <div className="sticky bottom-3 rounded-2xl border border-slate-700/60 bg-slate-900/90 p-3 backdrop-blur sm:static sm:border-none sm:bg-transparent sm:p-0">
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn-secondary w-full sm:w-auto" disabled={currentQuestionIndex === 0} onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}>Previous</button>
                {currentQuestionIndex < activeQuiz.questions.length - 1 ? (
                  <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}>Next</button>
                ) : (
                  <button type="button" className="btn-primary w-full sm:w-auto disabled:opacity-50" onClick={submitQuiz} disabled={submitLoading}>
                    {submitLoading ? "Submitting..." : "Submit Quiz"}
                  </button>
                )}
              </div>
              {submitError && <p className="mt-2 text-sm text-rose-400">{submitError}</p>}
            </div>
          </section>
        )}

        {activeView === VIEWS.QUIZ && activeQuiz && !currentQuestion && (
          <section className="mx-auto max-w-3xl">
            <article className="app-card">
              <h3 className="text-lg font-semibold">No questions available</h3>
              <p className="mt-2 text-sm text-slate-400">This quiz cannot be played because it has no questions.</p>
              <button type="button" className="btn-primary mt-4" onClick={() => setActiveView(VIEWS.BROWSE)}>Back to Browse</button>
            </article>
          </section>
        )}

        {activeView === VIEWS.RESULT && result && (
          <section className="mx-auto max-w-3xl space-y-4">
            <article className="app-card ring-1 ring-indigo-400/25">
              <p className="meta-label">Result</p>
              <h2 className="mt-1 text-2xl font-semibold">{result.scorePercent}%</h2>
              <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${result.scorePercent >= 80 ? "bg-emerald-500/10 text-emerald-300" : result.scorePercent >= 60 ? "bg-amber-500/10 text-amber-300" : "bg-rose-500/10 text-rose-300"}`}>
                {result.scorePercent >= 80 ? "Excellent" : result.scorePercent >= 60 ? "Good" : "Try Again"}
              </span>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">Correct: {result.correctCount}</div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">Wrong: {result.totalQuestions - result.correctCount}</div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">Total: {result.totalQuestions}</div>
              </div>
            </article>
            <article className="app-card space-y-2">
              {result.breakdown.map((entry, idx) => (
                <div key={entry.questionId} className={`rounded-xl border p-3 text-sm ${entry.isCorrect ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
                  Q{idx + 1}: {entry.isCorrect ? "Correct" : `Wrong (answer: ${entry.correctAnswer})`}
                </div>
              ))}
            </article>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => setActiveView(VIEWS.BROWSE)}>Take Similar Quiz</button>
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setActiveView(VIEWS.DASHBOARD)}>Back to Dashboard</button>
            </div>
          </section>
        )}

        {activeView === VIEWS.HISTORY && (
          <section className="app-card">
            <h2 className="text-2xl font-semibold">Quiz History</h2>
            {historyLoading && <p className="mt-2 text-sm text-slate-400">Loading history...</p>}
            {historyError && <p className="mt-2 text-sm text-rose-400">{historyError}</p>}
            <div className="mt-4 space-y-2">
              {attempts.length === 0 && <p className="text-sm text-slate-500">No attempts yet.</p>}
              {attempts.map((attempt) => (
                <article key={attempt._id || attempt.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{attempt.quizTitle}</p>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${attempt.scorePercent >= 60 ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
                        {attempt.scorePercent >= 60 ? "Pass" : "Needs Retry"}
                      </span>
                      <span className="text-sm text-indigo-300">{attempt.scorePercent}%</span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{new Date(attempt.submittedAt).toLocaleString()}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeView === VIEWS.CREATE && (
          <section className="app-card space-y-4">
            <div>
              <h2 className="text-2xl font-semibold">Create Quiz</h2>
              <p className="mt-1 text-sm text-slate-400">Create and publish a quiz with multiple-choice questions.</p>
            </div>
            <form onSubmit={handleCreateQuiz} className="space-y-4">
              <div>
                <label className="label-base">Quiz Title</label>
                <input className="input-base" value={createState.title} onChange={(e) => setCreateState((prev) => ({ ...prev, title: e.target.value }))} required />
              </div>
              <div>
                <label className="label-base">Category</label>
                <input className="input-base" value={createState.category} onChange={(e) => setCreateState((prev) => ({ ...prev, category: e.target.value }))} required />
              </div>
              <div>
                <label className="label-base">Description</label>
                <textarea className="input-base" rows={3} value={createState.description} onChange={(e) => setCreateState((prev) => ({ ...prev, description: e.target.value }))} />
              </div>
              <div className="space-y-3">
                {createState.questions.map((question, qIndex) => (
                  <div key={`q-${qIndex}`} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">Question {qIndex + 1}</p>
                      {createState.questions.length > 1 && <button type="button" className="text-xs text-rose-400" onClick={() => removeQuestion(qIndex)}>Remove</button>}
                    </div>
                    <input className="input-base mb-2" placeholder="Question text" value={question.text} onChange={(e) => updateQuestionField(qIndex, "text", e.target.value)} required />
                    <div className="space-y-2">
                      {question.options.map((option, optIndex) => (
                        <div key={`q-${qIndex}-o-${optIndex}`} className="flex items-center gap-2">
                          <input type="radio" name={`correct-${qIndex}`} checked={question.correctOptionIndex === optIndex} onChange={() => updateQuestionField(qIndex, "correctOptionIndex", optIndex)} />
                          <input className="input-base" placeholder={`Option ${optIndex + 1}`} value={option} onChange={(e) => updateOption(qIndex, optIndex, e.target.value)} required />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={addQuestion}>Add Question</button>
              {createMessage && <p className="text-sm text-indigo-300">{createMessage}</p>}
              <button type="submit" className="btn-primary w-full" disabled={createLoading}>{createLoading ? "Publishing..." : "Publish Quiz"}</button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
