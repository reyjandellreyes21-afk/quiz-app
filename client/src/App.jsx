import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import qaLogo from "./assets/QA-logo.png";
import websiteLeadersImage from "./assets/website-leaders.png";

/**
 * Dev: call the API on its own origin. The Vite proxy (`/api` → 4000) can 404 some POST routes
 * even when GET works. `cors()` on the server allows the browser origin.
 */
const defaultApiUrl = () => {
  if (!import.meta.env.DEV) return "http://localhost:4000/api/v1";
  return "http://127.0.0.1:4000/api/v1";
};
const API_URL = (import.meta.env.VITE_API_URL || defaultApiUrl()).replace(/\/+$/, "");
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const VIEWS = {
  DASHBOARD: "dashboard",
  BROWSE: "browse",
  QUIZ_INTRO: "quiz_intro",
  QUIZ: "quiz",
  RESULT: "result",
  HISTORY: "history",
  CREATE: "create",
  EDIT: "edit",
  PROFILE: "profile",
  USERS: "users",
};

const buildEmptyQuestion = () => ({
  text: "",
  kind: "mcq",
  options: ["", "", "", ""],
  correctOptionIndex: 0,
});
/** Title-case each word: "rey jandell b reyes" → "Rey Jandell B Reyes". */
const formatDisplayName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name
    .trim()
    .split(/\s+/)
    .map((segment) => {
      if (!segment) return "";
      return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(" ");
};
const toTitleCase = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .map((segment) => (segment ? segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase() : ""))
    .filter(Boolean)
    .join(" ");
const getQuizListId = (quiz) => quiz?.id || quiz?._id;
const isQuizOwner = (quiz, currentUser) => {
  if (!currentUser?.id || quiz?.createdBy == null || quiz.createdBy === "") return false;
  return String(quiz.createdBy) === String(currentUser.id);
};
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const getQuestionId = (question) => question?.id || question?._id;
const getQuestionKey = (question, index) => getQuestionId(question) || `idx-${index}`;
const normalizeQuestionKind = (value) => (value === "tf" ? "tf" : value === "fill" ? "fill" : "mcq");
const isQuestionInvalid = (q) => {
  if (!q.text?.trim() || q.text.trim().length < 5) return true;
  const kind = normalizeQuestionKind(q.kind);
  if (kind === "fill") return !(q.blankAnswer && String(q.blankAnswer).trim().length >= 1);
  return !Array.isArray(q.options) || q.options.some((o) => !String(o || "").trim()) || !q.options[q.correctOptionIndex]?.trim();
};
const buildQuestionPayload = (question) => {
  const kind = normalizeQuestionKind(question.kind);
  if (kind === "fill") {
    return {
      text: question.text.trim(),
      kind: "fill",
      options: [],
      correctAnswer: String(question.blankAnswer).trim(),
    };
  }
  return {
    text: question.text.trim(),
    kind,
    options: question.options.map((option) => option.trim()),
    correctAnswer: question.options[question.correctOptionIndex].trim(),
  };
};
const toEditableQuestion = (question) => {
  const kind = normalizeQuestionKind(question.kind);
  if (kind === "fill") {
    return {
      id: getQuestionId(question),
      text: question.text || "",
      kind: "fill",
      options: [],
      blankAnswer: question.correctAnswer || "",
      correctOptionIndex: 0,
    };
  }
  const options = Array.isArray(question.options) ? question.options : ["", ""];
  const matchedIndex = options.findIndex((opt) => String(opt).trim() === String(question.correctAnswer || "").trim());
  return {
    id: getQuestionId(question),
    text: question.text || "",
    kind,
    options,
    correctOptionIndex: matchedIndex >= 0 ? matchedIndex : 0,
    blankAnswer: "",
  };
};
const toCreateDraftQuestion = (question) => {
  const kind = normalizeQuestionKind(question.kind);
  if (kind === "fill") {
    return {
      text: question.text || "",
      kind: "fill",
      options: [],
      blankAnswer: question.correctAnswer || "",
      correctOptionIndex: 0,
    };
  }
  const options = Array.isArray(question.options) ? question.options : [];
  const safeOptions = kind === "tf" ? ["True", "False"] : options.length >= 2 ? options : ["", "", "", ""];
  const matchedIndex = safeOptions.findIndex((opt) => String(opt).trim() === String(question.correctAnswer || "").trim());
  return {
    text: question.text || "",
    kind,
    options: safeOptions,
    correctOptionIndex: matchedIndex >= 0 ? matchedIndex : 0,
    blankAnswer: "",
  };
};
const getApiErrorMessage = (payload, fallback) => {
  if (!payload || typeof payload !== "object") return fallback;
  const detailed = Array.isArray(payload.error?.details)
    ? payload.error.details
        .map((entry) => {
          const msg = entry?.msg || entry?.message;
          if (!msg) return "";
          const field = entry?.path || entry?.param;
          return field ? `${field}: ${msg}` : msg;
        })
        .filter(Boolean)
        .join(" ")
    : "";
  const normalizedDetails = detailed.replace(/\s{2,}/g, " ").trim();
  if (normalizedDetails) return normalizedDetails;
  const genericMessage = payload.error?.message || payload.message || fallback;
  return genericMessage === "Validation failed." ? "Please check your quiz fields and try again." : genericMessage;
};
const readApiPayload = async (response) => {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    if (!response.ok) return { error: { message: `Request failed (${response.status})` } };
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    if (!response.ok) {
      return { error: { message: text.slice(0, 200) || `Request failed (${response.status})` } };
    }
    return { error: { message: "Invalid response from server." } };
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
    const proxiedDev = import.meta.env.DEV && API_URL.startsWith("/");
    let fallback = `Request failed (${response.status})`;
    if (response.status === 502 && proxiedDev) {
      fallback =
        "Request failed (502): Vite could not reach the API at http://127.0.0.1:4000. Start the backend (quiz-app/server → npm run dev) and wait for MongoDB to connect.";
    }
    const requestedUrl =
      typeof window !== "undefined"
        ? (() => {
            try {
              const base =
                API_URL.startsWith("http") ? API_URL : `${window.location.origin}${API_URL.startsWith("/") ? "" : "/"}${API_URL}`;
              return new URL(path.replace(/^\//, ""), `${base.replace(/\/+$/, "")}/`).href;
            } catch {
              return `${API_URL}${path}`;
            }
          })()
        : `${API_URL}${path}`;
    const error = new Error(
      `${getApiErrorMessage(payload, fallback)}${response.status === 404 ? `\nRequested: ${requestedUrl}` : ""}`,
    );
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

const defaultHomePosts = [
  {
    id: "seed-1",
    author: "Ana Dela Cruz",
    role: "Civil Service Reviewee",
    content:
      "Anyone reviewing for the Civil Service Professional exam this month? I made a quick reviewer for analogy and grammar. I can share it if you need.",
    timeLabel: "2h ago",
    likes: 18,
    comments: 7,
  },
  {
    id: "seed-2",
    author: "Mark Santos",
    role: "PRC Board Exam Taker",
    content:
      "Sharing my routine: 50-item mock quiz every night + 30 mins discussion with my study buddy. Huge help for retention.",
    timeLabel: "4h ago",
    likes: 24,
    comments: 10,
  },
];

function LandingIllustration() {
  return (
    <img src={websiteLeadersImage} alt="Exam community leaders" className="h-auto w-full max-w-xl drop-shadow-2xl" />
  );
}

function QuizAppLogo({ className = "h-9 w-9" }) {
  return (
    <img src={qaLogo} alt="Quiz App logo" className={`rounded-xl object-cover shadow-sm ${className}`} />
  );
}

function EyeShowPasswordIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeHidePasswordIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 01-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function ChevronDownIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CategoryDropdown({ value, onChange, categories, placeholder = "Pick or type a category" }) {
  const [open, setOpen] = useState(false);
  const query = String(value || "").toLowerCase();
  const options = categories.filter((category) => !query || category.toLowerCase().includes(query));

  return (
    <div className="relative">
      <input
        className="input-base pr-10"
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        required
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-neutral-500 hover:text-neutral-700"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Toggle category suggestions"
      >
        <ChevronDownIcon className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && options.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
          {options.map((category) => (
            <button
              key={category}
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(category);
                setOpen(false);
              }}
            >
              {category}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const [authMode, setAuthMode] = useState("login");
  const [authPanelVisible, setAuthPanelVisible] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("quiz_token") || "");
  const [message, setMessage] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");

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
  const [browseDeleteId, setBrowseDeleteId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyClearLoading, setHistoryClearLoading] = useState(false);
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [quizLoading, setQuizLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [quizzesRefreshTick, setQuizzesRefreshTick] = useState(0);

  const [createState, setCreateState] = useState({
    title: "",
    category: "",
    description: "",
    generatorProvider: "manual",
    generatorQuestionCount: 5,
    questions: [buildEmptyQuestion()],
  });
  const [createMessage, setCreateMessage] = useState("");
  const [createGeneratorLoading, setCreateGeneratorLoading] = useState(false);
  const [editState, setEditState] = useState({ quizId: "", title: "", category: "", description: "", questions: [] });
  const [editRemovedQuestionIds, setEditRemovedQuestionIds] = useState([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [quizMessage, setQuizMessage] = useState("");
  const [homePostDraft, setHomePostDraft] = useState("");
  const [homePosts, setHomePosts] = useState(defaultHomePosts);
  const [likedPostIds, setLikedPostIds] = useState({});
  const [postComments, setPostComments] = useState({});
  const [commentDraftByPost, setCommentDraftByPost] = useState({});

  const googleBtnRef = useRef(null);

  useEffect(() => {
    const ensureIconLink = (selector, rel) => {
      let link = document.querySelector(selector);
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", rel);
        document.head.appendChild(link);
      }
      link.setAttribute("href", qaLogo);
      link.setAttribute("type", "image/png");
    };
    ensureIconLink('link[rel="icon"]', "icon");
    ensureIconLink('link[rel="apple-touch-icon"]', "apple-touch-icon");
  }, []);

  const submitQuiz = useCallback(async () => {
    if (!activeQuiz) return;
    setSubmitError("");
    setSubmitLoading(true);
    const submissionAnswers = activeQuiz.questions.reduce((acc, question, index) => {
      const questionId = getQuestionId(question);
      if (!questionId) return acc;
      const key = getQuestionKey(question, index);
      if (question.kind === "fill") {
        const typed = answers[key];
        if (typeof typed === "string" && typed.trim()) acc[questionId] = typed.trim();
        return acc;
      }
      const selectedOptionIndex = answers[key];
      if (typeof selectedOptionIndex === "number" && question.options[selectedOptionIndex] !== undefined) {
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
  }, [user, token, result, historyRefreshTick]);

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
    if (user || !GOOGLE_CLIENT_ID || !authPanelVisible || !googleBtnRef.current) return;
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
  }, [authMode, user, authPanelVisible]);

  const progress = useMemo(() => {
    if (!activeQuiz) return 0;
    return Math.round((Object.keys(answers).length / activeQuiz.questions.length) * 100);
  }, [activeQuiz, answers]);

  const streakDays = useMemo(() => getStreakDays(attempts), [attempts]);
  const currentQuestion = activeQuiz?.questions[currentQuestionIndex];

  const openAuthPanel = useCallback((mode) => {
    setAuthMode(mode);
    setMessage("");
    setAuthPanelVisible(true);
  }, []);

  const closeAuthPanel = useCallback(() => {
    setAuthPanelVisible(false);
    setMessage("");
    setShowAuthPassword(false);
    setShowConfirmPassword(false);
  }, []);

  useEffect(() => {
    if (!authPanelVisible || user) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeAuthPanel();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [authPanelVisible, user, closeAuthPanel]);

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!token || activeView !== VIEWS.PROFILE) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiRequest("/auth/me", { token });
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) {
          localStorage.removeItem("quiz_token");
          setToken("");
          setUser(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, activeView]);

  useEffect(() => {
    if (!token || activeView !== VIEWS.USERS) return undefined;
    let cancelled = false;
    setUsersLoading(true);
    setUsersError("");
    (async () => {
      try {
        const data = await apiRequest("/users", { token });
        if (!cancelled) setUsersList(data.users || []);
      } catch (error) {
        if (!cancelled) setUsersError(error.message || "Unable to load users.");
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, activeView]);

  const handleAuth = async (event) => {
    event.preventDefault();
    setMessage("");
    if (authMode === "signup" && form.password !== form.confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setAuthLoading(true);
    try {
      const endpoint = authMode === "signup" ? "/auth/register" : "/auth/login";
      const body =
        authMode === "signup"
          ? { name: form.name.trim(), email: form.email.trim(), password: form.password }
          : { email: form.email.trim(), password: form.password };
      const data = await apiRequest(endpoint, { method: "POST", body });
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem("quiz_token", data.token);
      setForm({ name: "", email: "", password: "", confirmPassword: "" });
      setShowAuthPassword(false);
      setShowConfirmPassword(false);
    } catch (error) {
      setMessage(error.message || "Cannot reach server.");
    } finally {
      setAuthLoading(false);
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
    setAuthPanelVisible(false);
    setAccountMenuOpen(false);
    setActiveQuiz(null);
    setResult(null);
    setSelectedQuiz(null);
  };

  const handleClearHistory = async () => {
    if (!token || attempts.length === 0) return;
    if (!window.confirm("Clear all quiz history? This cannot be undone.")) return;
    setHistoryClearLoading(true);
    try {
      await apiRequest("/users/me/history/clear", { method: "POST", token, body: {} });
      setHistoryRefreshTick((t) => t + 1);
    } catch (error) {
      window.alert(error.message || "Could not clear history.");
    } finally {
      setHistoryClearLoading(false);
    }
  };

  const handleDeleteQuiz = async (quiz) => {
    const quizId = getQuizListId(quiz);
    if (!quizId || !token || !isQuizOwner(quiz, user)) return;
    const title = quiz.title?.trim() || "this quiz";
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setBrowseDeleteId(quizId);
    try {
      await apiRequest(`/quizzes/${quizId}`, { method: "DELETE", token });
      if (selectedQuiz && getQuizListId(selectedQuiz) === quizId) {
        setSelectedQuiz(null);
        setActiveView(VIEWS.BROWSE);
      }
      setQuizzesRefreshTick((t) => t + 1);
    } catch (error) {
      window.alert(error.message || "Could not delete quiz.");
    } finally {
      setBrowseDeleteId(null);
    }
  };

  const openEditQuiz = async (quiz) => {
    const quizId = getQuizListId(quiz);
    if (!quizId || !token || !isQuizOwner(quiz, user)) return;
    setEditLoading(true);
    setEditMessage("");
    try {
      const meta = await apiRequest(`/quizzes/${quizId}`);
      let questions;
      try {
        questions = await apiRequest(`/quizzes/${quizId}/questions/manage`, { token });
      } catch (error) {
        if (error?.status === 404 || String(error?.message || "").toLowerCase().includes("route not found")) {
          throw new Error("Edit route is not available on your running backend yet. Restart the server (quiz-app/server -> npm run dev), then try Edit again.");
        }
        throw error;
      }
      const preparedQuestions = (Array.isArray(questions) ? questions : []).map(toEditableQuestion);
      setEditState({
        quizId,
        title: meta?.title ?? quiz.title ?? "",
        category: meta?.category ?? quiz.category ?? "",
        description: meta?.description ?? quiz.description ?? "",
        questions: preparedQuestions.length ? preparedQuestions : [buildEmptyQuestion()],
      });
      setEditRemovedQuestionIds([]);
      setActiveView(VIEWS.EDIT);
    } catch (error) {
      window.alert(error.message || "Unable to open editor.");
    } finally {
      setEditLoading(false);
    }
  };

  const addQuestion = () => setCreateState((prev) => ({ ...prev, questions: [...prev.questions, buildEmptyQuestion()] }));
  const removeQuestion = (index) => setCreateState((prev) => ({ ...prev, questions: prev.questions.filter((_, idx) => idx !== index) }));
  const updateQuestionField = (index, key, value) => setCreateState((prev) => {
    const next = [...prev.questions];
    next[index] = { ...next[index], [key]: value };
    return { ...prev, questions: next };
  });
  const setQuestionKind = (questionIndex, kind) => setCreateState((prev) => {
    const next = [...prev.questions];
    const q = next[questionIndex];
    const prevKind = q.kind === "tf" ? "tf" : q.kind === "fill" ? "fill" : "mcq";
    if (prevKind === kind) return prev;
    if (kind === "tf") {
      next[questionIndex] = {
        ...q,
        kind: "tf",
        options: ["True", "False"],
        correctOptionIndex: Math.min(q.correctOptionIndex, 1),
        blankAnswer: "",
      };
    } else if (kind === "fill") {
      next[questionIndex] = {
        ...q,
        kind: "fill",
        options: [],
        blankAnswer: "",
        correctOptionIndex: 0,
      };
    } else {
      next[questionIndex] = {
        ...q,
        kind: "mcq",
        options: ["", "", "", ""],
        correctOptionIndex: 0,
        blankAnswer: "",
      };
    }
    return { ...prev, questions: next };
  });
  const updateOption = (questionIndex, optionIndex, value) => setCreateState((prev) => {
    const next = [...prev.questions];
    const options = [...next[questionIndex].options];
    options[optionIndex] = value;
    next[questionIndex] = { ...next[questionIndex], options };
    return { ...prev, questions: next };
  });
  const addQuestionOption = (questionIndex) => setCreateState((prev) => {
    const next = [...prev.questions];
    const q = next[questionIndex];
    if (q.kind === "tf" || q.kind === "fill") return prev;
    next[questionIndex] = { ...q, options: [...q.options, ""] };
    return { ...prev, questions: next };
  });
  const removeQuestionOption = (questionIndex, optionIndex) => setCreateState((prev) => {
    const next = [...prev.questions];
    const q = next[questionIndex];
    if (q.kind === "tf" || q.kind === "fill") return prev;
    if (q.options.length <= 2) return prev;
    const options = q.options.filter((_, i) => i !== optionIndex);
    let { correctOptionIndex } = q;
    if (optionIndex === correctOptionIndex) correctOptionIndex = 0;
    else if (optionIndex < correctOptionIndex) correctOptionIndex -= 1;
    next[questionIndex] = { ...q, options, correctOptionIndex };
    return { ...prev, questions: next };
  });

  const handleGenerateQuestions = async () => {
    setCreateMessage("");
    const normalizedTitle = toTitleCase(createState.title);
    const normalizedCategory = toTitleCase(createState.category);
    if (!normalizedTitle || !normalizedCategory) {
      setCreateMessage("Add title and category first so Gemini can generate relevant questions.");
      return;
    }
    setCreateGeneratorLoading(true);
    try {
      const data = await apiRequest("/quizzes/generate", {
        method: "POST",
        token,
        body: {
          title: normalizedTitle,
          category: normalizedCategory,
          description: createState.description.trim(),
          questionCount: Number(createState.generatorQuestionCount) || 5,
        },
      });
      const generatedQuestions = Array.isArray(data?.questions) ? data.questions.map(toCreateDraftQuestion) : [];
      if (!generatedQuestions.length) {
        setCreateMessage("Gemini did not return valid questions. Try a more specific topic.");
        return;
      }
      setCreateState((prev) => ({
        ...prev,
        title: normalizedTitle,
        category: normalizedCategory,
        questions: generatedQuestions,
      }));
      setCreateMessage(`Generated ${generatedQuestions.length} question${generatedQuestions.length === 1 ? "" : "s"} with Gemini.`);
    } catch (error) {
      setCreateMessage(error.message || "Unable to generate questions right now.");
    } finally {
      setCreateGeneratorLoading(false);
    }
  };

  const handleCreateQuiz = async (event) => {
    event.preventDefault();
    setCreateMessage("");
    const normalizedTitle = toTitleCase(createState.title);
    const normalizedCategory = toTitleCase(createState.category);
    const hasInvalidQuestion = createState.questions.some((q) => {
      if (!q.text.trim() || q.text.trim().length < 5) return true;
      const k = q.kind === "tf" ? "tf" : q.kind === "fill" ? "fill" : "mcq";
      if (k === "fill") return !(q.blankAnswer && String(q.blankAnswer).trim().length >= 1);
      return q.options.some((o) => !o.trim()) || !q.options[q.correctOptionIndex]?.trim();
    });
    if (!normalizedTitle || !normalizedCategory || hasInvalidQuestion) return setCreateMessage("Complete title, category, and all question fields.");
    if (normalizedTitle.length < 3) return setCreateMessage("Quiz title must be at least 3 characters.");
    if (normalizedCategory.length < 2) return setCreateMessage("Category must be at least 2 characters.");
    setCreateLoading(true);
    try {
      const questionsPayload = createState.questions.map((question) => {
        const k = question.kind === "tf" ? "tf" : question.kind === "fill" ? "fill" : "mcq";
        if (k === "fill") {
          return {
            text: question.text.trim(),
            kind: "fill",
            options: [],
            correctAnswer: String(question.blankAnswer).trim(),
          };
        }
        return {
          text: question.text.trim(),
          kind: k,
          options: question.options.map((option) => option.trim()),
          correctAnswer: question.options[question.correctOptionIndex].trim(),
        };
      });

      await apiRequest("/quizzes/with-questions", {
        method: "POST",
        token,
        body: {
          title: normalizedTitle,
          category: normalizedCategory,
          description: createState.description.trim(),
          questions: questionsPayload,
        },
      });
      setCreateState((prev) => ({ ...prev, title: normalizedTitle, category: normalizedCategory }));
      setCreateMessage("Quiz published successfully.");
      setCreateState({
        title: "",
        category: "",
        description: "",
        generatorProvider: "manual",
        generatorQuestionCount: 5,
        questions: [buildEmptyQuestion()],
      });
      setQuizzesRefreshTick((prev) => prev + 1);
      setActiveView(VIEWS.BROWSE);
    } catch (error) {
      setCreateMessage(error.message || "Unable to publish now.");
    } finally {
      setCreateLoading(false);
    }
  };

  const addEditQuestion = () => setEditState((prev) => ({ ...prev, questions: [...prev.questions, buildEmptyQuestion()] }));
  const removeEditQuestion = (index) => setEditState((prev) => {
    const target = prev.questions[index];
    const targetId = getQuestionId(target);
    if (targetId) setEditRemovedQuestionIds((ids) => [...ids, targetId]);
    const nextQuestions = prev.questions.filter((_, idx) => idx !== index);
    return { ...prev, questions: nextQuestions.length ? nextQuestions : [buildEmptyQuestion()] };
  });
  const updateEditQuestionField = (index, key, value) => setEditState((prev) => {
    const next = [...prev.questions];
    next[index] = { ...next[index], [key]: value };
    return { ...prev, questions: next };
  });
  const setEditQuestionKind = (questionIndex, kind) => setEditState((prev) => {
    const next = [...prev.questions];
    const q = next[questionIndex];
    const prevKind = normalizeQuestionKind(q.kind);
    if (prevKind === kind) return prev;
    if (kind === "tf") {
      next[questionIndex] = { ...q, kind: "tf", options: ["True", "False"], correctOptionIndex: 0, blankAnswer: "" };
    } else if (kind === "fill") {
      next[questionIndex] = { ...q, kind: "fill", options: [], correctOptionIndex: 0, blankAnswer: "" };
    } else {
      next[questionIndex] = { ...q, kind: "mcq", options: ["", "", "", ""], correctOptionIndex: 0, blankAnswer: "" };
    }
    return { ...prev, questions: next };
  });
  const updateEditOption = (questionIndex, optionIndex, value) => setEditState((prev) => {
    const next = [...prev.questions];
    const options = [...next[questionIndex].options];
    options[optionIndex] = value;
    next[questionIndex] = { ...next[questionIndex], options };
    return { ...prev, questions: next };
  });
  const addEditOption = (questionIndex) => setEditState((prev) => {
    const next = [...prev.questions];
    const q = next[questionIndex];
    if (normalizeQuestionKind(q.kind) !== "mcq") return prev;
    next[questionIndex] = { ...q, options: [...q.options, ""] };
    return { ...prev, questions: next };
  });
  const removeEditOption = (questionIndex, optionIndex) => setEditState((prev) => {
    const next = [...prev.questions];
    const q = next[questionIndex];
    if (normalizeQuestionKind(q.kind) !== "mcq" || q.options.length <= 2) return prev;
    const options = q.options.filter((_, i) => i !== optionIndex);
    let { correctOptionIndex } = q;
    if (optionIndex === correctOptionIndex) correctOptionIndex = 0;
    else if (optionIndex < correctOptionIndex) correctOptionIndex -= 1;
    next[questionIndex] = { ...q, options, correctOptionIndex };
    return { ...prev, questions: next };
  });
  const handleSaveQuizEdits = async (event) => {
    event.preventDefault();
    setEditMessage("");
    const normalizedTitle = toTitleCase(editState.title);
    const normalizedCategory = toTitleCase(editState.category);
    if (normalizedTitle.length < 3) return setEditMessage("Quiz title must be at least 3 characters.");
    if (normalizedCategory.length < 2) return setEditMessage("Category must be at least 2 characters.");
    if (editState.questions.some(isQuestionInvalid)) return setEditMessage("Complete all question fields before saving.");
    setEditSaving(true);
    try {
      await apiRequest(`/quizzes/${editState.quizId}`, {
        method: "PUT",
        token,
        body: { title: normalizedTitle, category: normalizedCategory, description: editState.description.trim() },
      });
      setEditState((prev) => ({ ...prev, title: normalizedTitle, category: normalizedCategory }));
      for (const questionId of editRemovedQuestionIds) {
        await apiRequest(`/quizzes/${editState.quizId}/questions/${questionId}`, { method: "DELETE", token });
      }
      for (const question of editState.questions) {
        const payload = buildQuestionPayload(question);
        const questionId = getQuestionId(question);
        if (questionId) {
          await apiRequest(`/quizzes/${editState.quizId}/questions/${questionId}`, { method: "PUT", token, body: payload });
        } else {
          await apiRequest(`/quizzes/${editState.quizId}/questions`, { method: "POST", token, body: payload });
        }
      }
      setEditMessage("Quiz updated successfully.");
      setQuizzesRefreshTick((prev) => prev + 1);
      setActiveView(VIEWS.BROWSE);
    } catch (error) {
      setEditMessage(error.message || "Unable to save quiz changes.");
    } finally {
      setEditSaving(false);
    }
  };

  const renderNavButton = (id, label) => (
    <button
      type="button"
      onClick={() => {
        setActiveView(id);
        setMobileMenuOpen(false);
      }}
      className={`w-full rounded-xl px-3 py-2 text-center text-sm md:w-auto md:min-w-[6.75rem] md:shrink-0 ${activeView === id ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"}`}
    >
      {label}
    </button>
  );

  if (!user) {
    return (
      <div className="landing-shell">
        <header className="landing-nav">
          <div className="app-container flex h-16 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <QuizAppLogo className="h-9 w-9 shrink-0" />
              <span className="truncate text-lg font-semibold tracking-tight text-neutral-900">Quiz App</span>
            </div>
            <nav className="flex shrink-0 items-center gap-2 sm:gap-3" aria-label="Sign in">
              <button type="button" className="landing-btn-nav-text" onClick={() => openAuthPanel("login")}>
                Log in
              </button>
              <button type="button" className="landing-btn-nav-primary" onClick={() => openAuthPanel("signup")}>
                Sign up
              </button>
            </nav>
          </div>
        </header>

        <main className="app-container pb-20 pt-10 md:pb-28 md:pt-14">
          <div className="grid gap-12 lg:grid-cols-[1.3fr_0.7fr] lg:items-center lg:gap-14">
            <section className="space-y-6">
              <p className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600 shadow-sm">
                Philippines Exam Community
              </p>
              <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-neutral-900 sm:text-5xl sm:leading-[1.05]">
                A learning forum for <span className="text-brand-primary">Filipino exam takers</span>
              </h1>
              <p className="text-lg leading-relaxed text-neutral-600">
                Exchange knowledge, share reviewers, and test your readiness before Civil Service, PRC, Bar, NAPOLCOM, and other Philippine exams.
              </p>
              <div className="grid gap-2 text-sm text-neutral-700 sm:grid-cols-2">
                {["Topic-based discussion threads", "Peer-reviewed practice questions", "Study buddy accountability groups", "Weekly mock quiz events"].map((point) => (
                  <p key={point} className="rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm">
                    {point}
                  </p>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button type="button" className="landing-hero-cta" onClick={() => openAuthPanel("signup")}>
                  Join Exam Forum
                </button>
                <button type="button" className="btn-secondary rounded-full px-6" onClick={() => openAuthPanel("login")}>
                  Continue learning
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 pt-2 text-sm text-neutral-700 sm:grid-cols-3">
                <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-center">
                  <span className="block text-lg font-bold text-neutral-900">12k+</span>
                  Forum posts
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-center">
                  <span className="block text-lg font-bold text-neutral-900">250+</span>
                  Mock quizzes
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-center">
                  <span className="block text-lg font-bold text-neutral-900">24/7</span>
                  Peer support
                </div>
              </div>
            </section>
            <div className="flex justify-center lg:justify-end">
              <LandingIllustration />
            </div>
          </div>

          <section className="mt-10 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm md:mt-14 md:p-6">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-neutral-500">Choose your target exam</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-4">
              {["Civil Service", "PRC Licensure", "Bar Exam", "NAPOLCOM & DEPED"].map((group) => (
                <div key={group} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 font-medium text-neutral-700">
                  {group}
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article className="app-card">
              <p className="text-sm font-semibold text-brand-primary">Guided Discussions</p>
              <h3 className="mt-1 text-lg font-semibold text-neutral-900">Clarify difficult topics faster</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">Discuss confusing concepts with fellow reviewees and learn from practical explanations.</p>
            </article>
            <article className="app-card">
              <p className="text-sm font-semibold text-brand-primary">Resource Exchange</p>
              <h3 className="mt-1 text-lg font-semibold text-neutral-900">Get quality reviewers and drills</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">Access community-shared notes, flashcards, and mock tests by exam category.</p>
            </article>
            <article className="app-card sm:col-span-2 lg:col-span-1">
              <p className="text-sm font-semibold text-brand-primary">Study Buddy Matching</p>
              <h3 className="mt-1 text-lg font-semibold text-neutral-900">Stay consistent until exam day</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">Pair up with exam buddies for daily check-ins, goal tracking, and motivation.</p>
            </article>
          </section>

          <section className="mt-8 rounded-2xl border border-brand-border bg-brand-soft/40 p-6 text-center md:mt-10">
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Start your review journey with people who get it</h2>
            <p className="mt-2 text-sm text-neutral-700">Build confidence, sharpen your weak areas, and prepare smarter with a supportive exam community.</p>
            <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
              <button type="button" className="landing-hero-cta" onClick={() => openAuthPanel("signup")}>
                Create free account
              </button>
              <button type="button" className="btn-secondary rounded-full px-6" onClick={() => openAuthPanel("login")}>
                Log in
              </button>
            </div>
          </section>
        </main>

        {authPanelVisible && (
          <div
            className="landing-auth-modal-root fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
          >
            <button
              type="button"
              className="landing-auth-modal-backdrop absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px]"
              aria-label="Close sign-in dialog"
              onClick={closeAuthPanel}
            />
            <div className="landing-auth-panel relative z-10 w-full max-w-md" onClick={(event) => event.stopPropagation()}>
              <div className="landing-card relative">
                <button type="button" className="landing-auth-close" onClick={closeAuthPanel} aria-label="Close">
                  <span aria-hidden="true">×</span>
                </button>
                <div className="mb-6 pr-10">
                  <h2 id="auth-modal-title" className="text-2xl font-bold tracking-tight text-neutral-900">
                    {authMode === "signup" ? "Create an account" : "Welcome back"}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                    {authMode === "signup"
                      ? "Create your account to join exam-focused groups and start your review plan."
                      : "Sign in with email or Google to continue your forum and review progress."}
                  </p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                {authMode === "signup" && (
                  <div>
                    <label htmlFor="auth-name" className="mb-1.5 block text-sm font-medium text-neutral-700">
                      Full name
                    </label>
                    <input
                      id="auth-name"
                      name="name"
                      className="landing-input"
                      placeholder="Jane Doe"
                      autoComplete="name"
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium text-neutral-700">
                    Email
                  </label>
                  <input
                    id="auth-email"
                    name="email"
                    className="landing-input"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium text-neutral-700">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="auth-password"
                      name="password"
                      className="landing-input pr-11"
                      type={showAuthPassword ? "text" : "password"}
                      placeholder="At least 8 characters"
                      minLength={8}
                      autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                      value={form.password}
                      onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/35"
                      onClick={() => setShowAuthPassword((prev) => !prev)}
                      aria-label={showAuthPassword ? "Hide password" : "Show password"}
                      aria-pressed={showAuthPassword}
                      tabIndex={0}
                    >
                      {showAuthPassword ? <EyeHidePasswordIcon /> : <EyeShowPasswordIcon />}
                    </button>
                  </div>
                </div>
                {authMode === "signup" && (
                  <div>
                    <label htmlFor="auth-confirm-password" className="mb-1.5 block text-sm font-medium text-neutral-700">
                      Confirm password
                    </label>
                    <div className="relative">
                      <input
                        id="auth-confirm-password"
                        name="confirmPassword"
                        className="landing-input pr-11"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Re-enter your password"
                        minLength={8}
                        autoComplete="new-password"
                        value={form.confirmPassword}
                        onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                        required
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/35"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        aria-pressed={showConfirmPassword}
                        tabIndex={0}
                      >
                        {showConfirmPassword ? <EyeHidePasswordIcon /> : <EyeShowPasswordIcon />}
                      </button>
                    </div>
                  </div>
                )}
                {message && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                    {message}
                  </p>
                )}
                <button type="submit" className="landing-btn-primary" disabled={authLoading}>
                  {authLoading
                    ? authMode === "signup"
                      ? "Creating account…"
                      : "Signing in…"
                    : authMode === "signup"
                      ? "Create account"
                      : "Log in"}
                </button>
                </form>

                <div className="my-6 flex items-center gap-3">
                  <span className="h-px flex-1 bg-neutral-200" />
                  <span className="text-xs font-medium uppercase tracking-wide text-neutral-600">or</span>
                  <span className="h-px flex-1 bg-neutral-200" />
                </div>

                <div className="flex flex-col items-center gap-3">
                  {GOOGLE_CLIENT_ID ? (
                    <div
                      className="flex min-h-[44px] w-full max-w-[320px] justify-center [&>div]:w-full [&>div]:flex [&>div]:justify-center"
                      ref={googleBtnRef}
                    />
                  ) : (
                    <p className="text-center text-xs text-neutral-500">
                      Add{" "}
                      <code className="rounded bg-neutral-100 px-1 py-0.5 text-[11px] text-neutral-700">VITE_GOOGLE_CLIENT_ID</code>{" "}
                      for Google sign-in.
                    </p>
                  )}
                </div>

                <p className="mt-8 text-center text-sm text-neutral-600">
                  {authMode === "signup" ? (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        className="landing-link"
                        onClick={() => {
                          setAuthMode("login");
                          setMessage("");
                          setShowAuthPassword(false);
                          setShowConfirmPassword(false);
                          setForm((prev) => ({ ...prev, confirmPassword: "" }));
                        }}
                      >
                        Log in
                      </button>
                    </>
                  ) : (
                    <>
                      New here?{" "}
                      <button
                        type="button"
                        className="landing-link"
                        onClick={() => {
                          setAuthMode("signup");
                          setMessage("");
                          setShowAuthPassword(false);
                          setShowConfirmPassword(false);
                        }}
                      >
                        Create account
                      </button>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="app-container flex h-16 items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-3 rounded-xl px-1 py-1 text-left focus:outline-none"
            onClick={() => {
              setActiveView(VIEWS.DASHBOARD);
              setMobileMenuOpen(false);
            }}
            aria-label="Go to dashboard"
          >
            <QuizAppLogo className="h-9 w-9 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-neutral-900">Quiz App</p>
              <p className="text-xs text-neutral-500">Modern learning SaaS</p>
            </div>
          </button>
          <nav className="hidden items-center gap-2 md:flex" aria-label="Main">
            {renderNavButton(VIEWS.DASHBOARD, "Home")}
            {renderNavButton(VIEWS.BROWSE, "Browse")}
            {renderNavButton(VIEWS.HISTORY, "History")}
            {renderNavButton(VIEWS.CREATE, "Create")}
          </nav>
          <div className="hidden items-center md:flex">
            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50"
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
                onClick={() => setAccountMenuOpen((prev) => !prev)}
              >
                <span className="max-w-[10rem] truncate">{formatDisplayName(user?.name || "") || "Account"}</span>
                <ChevronDownIcon className={`shrink-0 text-neutral-500 transition-transform ${accountMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {accountMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-4 py-2.5 text-left text-sm text-neutral-800 hover:bg-neutral-50"
                    onClick={() => {
                      setActiveView(VIEWS.PROFILE);
                      setAccountMenuOpen(false);
                    }}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-4 py-2.5 text-left text-sm text-neutral-800 hover:bg-neutral-50"
                    onClick={() => {
                      setActiveView(VIEWS.USERS);
                      setAccountMenuOpen(false);
                    }}
                  >
                    Users
                  </button>
                  <button type="button" role="menuitem" className="flex w-full px-4 py-2.5 text-left text-sm font-medium text-rose-700 hover:bg-rose-50" onClick={logout}>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
          <button type="button" className="btn-ghost md:hidden" onClick={() => setMobileMenuOpen((prev) => !prev)}>Menu</button>
        </div>
        {mobileMenuOpen && (
          <div className="app-container pb-3 md:hidden">
            <div className="app-card flex flex-col gap-2 p-3">
              {renderNavButton(VIEWS.DASHBOARD, "Home")}
              {renderNavButton(VIEWS.BROWSE, "Browse")}
              {renderNavButton(VIEWS.HISTORY, "History")}
              {renderNavButton(VIEWS.CREATE, "Create")}
              <div className="my-1 border-t border-neutral-200 pt-2">
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Account</p>
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-center text-sm text-neutral-800 hover:bg-neutral-100"
                  onClick={() => {
                    setActiveView(VIEWS.PROFILE);
                    setMobileMenuOpen(false);
                  }}
                >
                  Profile
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-center text-sm text-neutral-800 hover:bg-neutral-100"
                  onClick={() => {
                    setActiveView(VIEWS.USERS);
                    setMobileMenuOpen(false);
                  }}
                >
                  Users
                </button>
                <button type="button" className="btn-danger mt-1 w-full" onClick={() => { logout(); setMobileMenuOpen(false); }}>
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="app-container space-y-4 py-6 md:space-y-6">
        {activeView === VIEWS.DASHBOARD && (
          <section className="space-y-4 md:space-y-6">
            {dashboardLoading && <p className="text-sm text-neutral-600">Loading home feed...</p>}
            {dashboardError && <p className="text-sm text-rose-700">{dashboardError}</p>}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <article className="app-card">
                  <h2 className="text-xl font-semibold">What's on your mind?</h2>
                  <p className="mt-1 text-sm text-neutral-600">Share tips, ask questions, or post your exam progress.</p>
                  <textarea
                    className="input-base mt-3 min-h-[110px] resize-y"
                    placeholder="Post something helpful for your fellow examinees..."
                    value={homePostDraft}
                    onChange={(e) => setHomePostDraft(e.target.value)}
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="btn-primary px-6 disabled:opacity-50"
                      disabled={!homePostDraft.trim()}
                      onClick={() => {
                        const content = homePostDraft.trim();
                        if (!content) return;
                        setHomePosts((prev) => [
                          {
                            id: `post-${Date.now()}`,
                            author: formatDisplayName(user?.name || "You") || "You",
                            role: "Forum Member",
                            content,
                            timeLabel: "Just now",
                            likes: 0,
                            comments: 0,
                          },
                          ...prev,
                        ]);
                        setHomePostDraft("");
                      }}
                    >
                      Post
                    </button>
                  </div>
                </article>

                <div className="space-y-3">
                  {homePosts.map((post) => (
                    <article key={post.id} className="app-card">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">{post.author}</p>
                          <p className="text-xs text-neutral-500">
                            {post.role} • {post.timeLabel}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-neutral-700">{post.content}</p>
                      <div className="mt-4 flex items-center gap-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                        <span>{post.likes + (likedPostIds[post.id] ? 1 : 0)} likes</span>
                        <span>{post.comments + (postComments[post.id]?.length || 0)} comments</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            likedPostIds[post.id]
                              ? "border-brand-border bg-brand-soft text-brand-primary"
                              : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                          }`}
                          onClick={() =>
                            setLikedPostIds((prev) => ({
                              ...prev,
                              [post.id]: !prev[post.id],
                            }))
                          }
                        >
                          {likedPostIds[post.id] ? "Liked" : "Like"}
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(postComments[post.id] || []).map((entry) => (
                          <div key={entry.id} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
                            <p className="text-xs font-semibold text-neutral-800">{entry.author}</p>
                            <p className="mt-1 text-sm text-neutral-700">{entry.content}</p>
                          </div>
                        ))}
                        <div className="flex items-center gap-2">
                          <input
                            className="input-base h-10"
                            placeholder="Write a comment..."
                            value={commentDraftByPost[post.id] || ""}
                            onChange={(e) =>
                              setCommentDraftByPost((prev) => ({
                                ...prev,
                                [post.id]: e.target.value,
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="btn-secondary h-10 px-4 py-0 disabled:opacity-50"
                            disabled={!String(commentDraftByPost[post.id] || "").trim()}
                            onClick={() => {
                              const content = String(commentDraftByPost[post.id] || "").trim();
                              if (!content) return;
                              setPostComments((prev) => ({
                                ...prev,
                                [post.id]: [
                                  ...(prev[post.id] || []),
                                  {
                                    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                                    author: formatDisplayName(user?.name || "You") || "You",
                                    content,
                                  },
                                ],
                              }));
                              setCommentDraftByPost((prev) => ({ ...prev, [post.id]: "" }));
                            }}
                          >
                            Comment
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <article className="app-card">
                  <h3 className="text-lg font-semibold">Quick Stats</h3>
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                      <span className="text-neutral-600">Quizzes Taken</span>
                      <span className="font-semibold text-neutral-900">{dashboard.totalAttempts || 0}</span>
                    </p>
                    <p className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                      <span className="text-neutral-600">Average Score</span>
                      <span className="font-semibold text-neutral-900">{dashboard.averageScore || 0}%</span>
                    </p>
                    <p className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                      <span className="text-neutral-600">Current Streak</span>
                      <span className="font-semibold text-neutral-900">{streakDays} days</span>
                    </p>
                  </div>
                </article>
                <article className="app-card">
                  <h3 className="text-lg font-semibold">Community Tips</h3>
                  <ul className="mt-3 space-y-2 text-sm text-neutral-700">
                    <li className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">Answer at least one forum question daily.</li>
                    <li className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">Share one reviewer per week to help others.</li>
                    <li className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">Join a study buddy group for accountability.</li>
                  </ul>
                </article>
              </div>
            </div>
          </section>
        )}

        {activeView === VIEWS.BROWSE && (
          <section className="space-y-4 md:space-y-6">
            {browseLoading && <p className="text-sm text-neutral-600">Loading quizzes...</p>}
            {browseError && <p className="text-sm text-rose-700">{browseError}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedCategory("")} className={`rounded-full px-3 py-1 text-xs font-medium ${selectedCategory === "" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "bg-neutral-100 text-neutral-700"}`}>All</button>
              {categories.map((category) => (
                <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={`rounded-full px-3 py-1 text-xs font-medium ${selectedCategory === category ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "bg-neutral-100 text-neutral-700"}`}>
                  {category}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {quizzes.map((quiz) => {
                const qid = getQuizListId(quiz);
                const own = isQuizOwner(quiz, user);
                const deleting = browseDeleteId === qid;
                return (
                  <article key={qid} className="app-card-interactive group flex h-full flex-col">
                    <div className="min-h-0 flex-1">
                      <span className="inline-flex rounded-full border border-brand-border bg-brand-soft px-3 py-1 text-xs font-medium text-brand-primary">{quiz.category}</span>
                      <h3 className="mt-2 text-lg font-semibold">{quiz.title}</h3>
                      <p className="mt-2 line-clamp-2 text-sm text-neutral-600">{quiz.description || "Challenge yourself with this quiz."}</p>
                      <p className="mt-3 text-sm text-neutral-600">{quiz.questionCount} questions • {Math.max(1, Math.round(quiz.questionCount / 2))} min</p>
                    </div>
                    <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-neutral-100 pt-4">
                      <button type="button" onClick={() => { setSelectedQuiz(quiz); setActiveView(VIEWS.QUIZ_INTRO); }} className="btn-primary w-full">View Quiz</button>
                      {own && (
                        <>
                          <button
                            type="button"
                            className="btn-secondary w-full disabled:opacity-60"
                            disabled={editLoading}
                            onClick={() => openEditQuiz(quiz)}
                          >
                            {editLoading ? "Opening editor..." : "Edit quiz"}
                          </button>
                          <button
                            type="button"
                            className="btn-danger w-full disabled:opacity-60"
                            disabled={deleting}
                            onClick={() => handleDeleteQuiz(quiz)}
                          >
                            {deleting ? "Deleting…" : "Delete quiz"}
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            {!browseLoading && quizzes.length === 0 && (
              <article className="app-card">
                <h3 className="text-lg font-semibold">No playable quizzes yet</h3>
                <p className="mt-2 text-sm text-neutral-600">Create a quiz and add at least one question to make it appear here.</p>
                <button type="button" className="btn-primary mt-4" onClick={() => setActiveView(VIEWS.CREATE)}>Go to Create</button>
              </article>
            )}
          </section>
        )}

        {activeView === VIEWS.EDIT && (
          <section className="app-card space-y-4 md:space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-2xl font-semibold">Edit Quiz</h2>
                <p className="mt-1 text-sm text-neutral-600">Update quiz info and manage questions.</p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setActiveView(VIEWS.BROWSE)}>Back to Browse</button>
            </div>
            <form onSubmit={handleSaveQuizEdits} className="space-y-4">
              <div>
                <label className="label-base">Quiz Title</label>
                <input className="input-base" value={editState.title} onChange={(e) => setEditState((prev) => ({ ...prev, title: e.target.value }))} required />
              </div>
              <div>
                <label className="label-base">Category</label>
                <CategoryDropdown
                  value={editState.category}
                  onChange={(nextCategory) => setEditState((prev) => ({ ...prev, category: nextCategory }))}
                  categories={categories}
                />
              </div>
              <div>
                <label className="label-base">Description</label>
                <textarea className="input-base" rows={3} value={editState.description} onChange={(e) => setEditState((prev) => ({ ...prev, description: e.target.value }))} />
              </div>
              <div className="space-y-3">
                {editState.questions.map((question, qIndex) => {
                  const qKind = normalizeQuestionKind(question.kind);
                  return (
                    <div key={`edit-q-${getQuestionId(question) || qIndex}`} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold">Question {qIndex + 1}</p>
                        <button type="button" className="text-xs text-rose-600" onClick={() => removeEditQuestion(qIndex)}>Remove</button>
                      </div>
                      <input className="input-base mb-2" placeholder="Question text" value={question.text} onChange={(e) => updateEditQuestionField(qIndex, "text", e.target.value)} required />
                      <div className="mb-3">
                        <p className="label-base mb-2">Answer type</p>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setEditQuestionKind(qIndex, "mcq")} className={`rounded-xl px-3 py-2 text-sm ${qKind === "mcq" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"}`}>Multiple choice</button>
                          <button type="button" onClick={() => setEditQuestionKind(qIndex, "tf")} className={`rounded-xl px-3 py-2 text-sm ${qKind === "tf" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"}`}>True / false</button>
                          <button type="button" onClick={() => setEditQuestionKind(qIndex, "fill")} className={`rounded-xl px-3 py-2 text-sm ${qKind === "fill" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"}`}>Fill in the blank</button>
                        </div>
                      </div>
                      {qKind === "fill" ? (
                        <div>
                          <label className="label-base">Correct answer</label>
                          <input className="input-base mt-1" value={question.blankAnswer || ""} onChange={(e) => updateEditQuestionField(qIndex, "blankAnswer", e.target.value)} required />
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            {question.options.map((option, optIndex) => (
                              <div key={`edit-q-${qIndex}-o-${optIndex}`} className="flex items-center gap-2">
                                <input type="radio" name={`edit-correct-${qIndex}`} checked={question.correctOptionIndex === optIndex} onChange={() => updateEditQuestionField(qIndex, "correctOptionIndex", optIndex)} />
                                <input className="input-base min-w-0 flex-1" placeholder={qKind === "tf" ? (optIndex === 0 ? "True" : "False") : `Option ${optIndex + 1}`} value={option} onChange={(e) => updateEditOption(qIndex, optIndex, e.target.value)} required />
                                {qKind === "mcq" && question.options.length > 2 && (
                                  <button type="button" className="shrink-0 text-xs text-neutral-500 hover:text-rose-600" onClick={() => removeEditOption(qIndex, optIndex)}>Remove</button>
                                )}
                              </div>
                            ))}
                          </div>
                          {qKind === "mcq" && (
                            <button type="button" className="btn-secondary mt-2 w-full sm:w-auto" onClick={() => addEditOption(qIndex)}>
                              Add option
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={addEditQuestion}>Add Question</button>
              {editMessage && (
                <p className={`text-sm font-medium ${editMessage.includes("success") ? "text-emerald-700" : "text-rose-700"}`}>
                  {editMessage}
                </p>
              )}
              <button type="submit" className="btn-primary w-full" disabled={editSaving}>{editSaving ? "Saving..." : "Save Changes"}</button>
            </form>
          </section>
        )}

        {activeView === VIEWS.QUIZ_INTRO && selectedQuiz && (
          <section className="app-card relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-soft via-white to-neutral-50" />
            <div className="relative space-y-4">
              <h2 className="text-2xl font-semibold">{selectedQuiz.title}</h2>
              <p className="text-sm text-neutral-700">{selectedQuiz.description || "No description provided."}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">Category: {selectedQuiz.category}</div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">Questions: {selectedQuiz.questionCount}</div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">Estimated: {selectedQuiz.questionCount * 30}s</div>
              </div>
              {quizMessage && <p className="text-sm text-rose-700">{quizMessage}</p>}
              <label className="flex items-center gap-2 text-sm text-neutral-700">
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
                <p className="text-neutral-600">{activeQuiz.title}</p>
                <p className="font-medium text-brand-primary">{timedMode ? formatTime(secondsLeft) : "Practice Mode"}</p>
              </div>
              <div className="h-2 rounded-full bg-neutral-200">
                <div className="h-2 rounded-full bg-brand-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500">Question {currentQuestionIndex + 1} of {activeQuiz.questions.length}</p>
            </div>

            <div className="app-card">
              <h3 className="text-lg font-semibold">{currentQuestion.text}</h3>
              {(() => {
                const cqKey = getQuestionKey(currentQuestion, currentQuestionIndex);
                const fillVal = answers[cqKey];
                return currentQuestion.kind === "fill" ? (
                  <div className="mt-4">
                    <label className="label-base" htmlFor={`fill-${cqKey}`}>
                      Your answer
                    </label>
                    <input
                      id={`fill-${cqKey}`}
                      type="text"
                      className="input-base mt-1"
                      value={typeof fillVal === "string" ? fillVal : ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [cqKey]: e.target.value }))}
                      placeholder="Type your answer"
                      autoComplete="off"
                    />
                  </div>
                ) : (
                  <div className="mt-4 grid gap-2">
                    {currentQuestion.options.map((option, optionIndex) => (
                      <button
                        key={`${cqKey}-${optionIndex}`}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, [cqKey]: optionIndex }))}
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${answers[cqKey] === optionIndex ? "border-brand-primary bg-brand-soft text-brand-primary" : "border-neutral-200 bg-white text-neutral-800 hover:border-brand-border"}`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="sticky bottom-3 rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:static sm:border-none sm:bg-transparent sm:p-0 sm:shadow-none">
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
              {submitError && <p className="mt-2 text-sm text-rose-700">{submitError}</p>}
            </div>
          </section>
        )}

        {activeView === VIEWS.QUIZ && activeQuiz && !currentQuestion && (
          <section className="mx-auto max-w-3xl">
            <article className="app-card">
              <h3 className="text-lg font-semibold">No questions available</h3>
              <p className="mt-2 text-sm text-neutral-600">This quiz cannot be played because it has no questions.</p>
              <button type="button" className="btn-primary mt-4" onClick={() => setActiveView(VIEWS.BROWSE)}>Back to Browse</button>
            </article>
          </section>
        )}

        {activeView === VIEWS.RESULT && result && (
          <section className="mx-auto max-w-3xl space-y-4">
            <article className="app-card ring-1 ring-brand-border">
              <p className="meta-label">Result</p>
              <h2 className="mt-1 text-2xl font-semibold">{result.scorePercent}%</h2>
              <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${result.scorePercent >= 80 ? "bg-brand-muted text-brand-primary" : result.scorePercent >= 60 ? "bg-brand-soft text-brand-primary" : "bg-neutral-100 text-neutral-600"}`}>
                {result.scorePercent >= 80 ? "Excellent" : result.scorePercent >= 60 ? "Good" : "Try Again"}
              </span>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">Correct: {result.correctCount}</div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">Wrong: {result.totalQuestions - result.correctCount}</div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">Total: {result.totalQuestions}</div>
              </div>
            </article>
            <article className="app-card space-y-2">
              {result.breakdown.map((entry, idx) => (
                <div key={entry.questionId} className={`rounded-xl border p-3 text-sm ${entry.isCorrect ? "border-brand-border bg-brand-soft text-brand-primary" : "border-neutral-200 bg-neutral-50 text-neutral-800"}`}>
                  Q{idx + 1}: {entry.isCorrect ? "Correct" : `Wrong (answer: ${entry.correctAnswer})`}
                </div>
              ))}
            </article>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => setActiveView(VIEWS.BROWSE)}>Take Similar Quiz</button>
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setActiveView(VIEWS.DASHBOARD)}>Back to Home</button>
            </div>
          </section>
        )}

        {activeView === VIEWS.HISTORY && (
          <section className="app-card space-y-4 md:space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold">Quiz History</h2>
              <button
                type="button"
                className="btn-danger shrink-0 disabled:opacity-50"
                disabled={attempts.length === 0 || historyLoading || historyClearLoading}
                onClick={handleClearHistory}
              >
                {historyClearLoading ? "Clearing…" : "Clear history"}
              </button>
            </div>
            {historyLoading && <p className="text-sm text-neutral-600">Loading history...</p>}
            {historyError && <p className="text-sm text-rose-700">{historyError}</p>}
            <div className="space-y-2">
              {attempts.length === 0 && <p className="text-sm text-neutral-500">No attempts yet.</p>}
              {attempts.map((attempt) => (
                <article key={attempt._id || attempt.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{attempt.quizTitle}</p>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${attempt.scorePercent >= 60 ? "bg-brand-soft text-brand-primary" : "bg-neutral-100 text-neutral-600"}`}>
                        {attempt.scorePercent >= 60 ? "Pass" : "Needs Retry"}
                      </span>
                      <span className="text-sm font-medium text-brand-primary">{attempt.scorePercent}%</span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">{new Date(attempt.submittedAt).toLocaleString()}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeView === VIEWS.PROFILE && (
          <section className="app-card space-y-4 md:space-y-6">
            <h2 className="text-2xl font-semibold">Profile</h2>
            {user ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-xl font-bold text-brand-primary ring-1 ring-brand-border">
                    {(formatDisplayName(user.name) || "?").charAt(0)}
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-neutral-900">{formatDisplayName(user.name)}</p>
                    <p className="text-sm text-neutral-600">{user.email}</p>
                  </div>
                </div>
                <p className="text-xs text-neutral-500">Details refresh from the server when you open this page.</p>
              </div>
            ) : (
              <p className="text-sm text-rose-700">Could not load your profile. Try signing in again.</p>
            )}
          </section>
        )}

        {activeView === VIEWS.USERS && (
          <section className="app-card space-y-4 md:space-y-6">
            <div>
              <h2 className="text-2xl font-semibold">Users</h2>
              <p className="mt-1 text-sm text-neutral-600">People registered on this app (names only).</p>
            </div>
            {usersLoading && <p className="text-sm text-neutral-600">Loading users...</p>}
            {usersError && <p className="text-sm text-rose-700">{usersError}</p>}
            {!usersLoading && !usersError && (
              <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
                {usersList.length === 0 && <li className="px-4 py-6 text-sm text-neutral-500">No users yet.</li>}
                {usersList.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="font-medium text-neutral-900">{formatDisplayName(u.name)}</span>
                    {u.joinedAt && (
                      <span className="text-xs text-neutral-500">{new Date(u.joinedAt).toLocaleDateString()}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {activeView === VIEWS.CREATE && (
          <section className="app-card space-y-4 md:space-y-6">
            <div>
              <h2 className="text-2xl font-semibold">Create Quiz</h2>
              <p className="mt-1 text-sm text-neutral-600">Create and publish a quiz with multiple-choice, true/false, or fill-in-the-blank questions.</p>
            </div>
            <form onSubmit={handleCreateQuiz} className="space-y-4">
              <div>
                <label className="label-base">Quiz Title</label>
                <input
                  className="input-base"
                  placeholder="e.g. Math"
                  value={createState.title}
                  onChange={(e) => setCreateState((prev) => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label-base">Category</label>
                <CategoryDropdown
                  value={createState.category}
                  onChange={(nextCategory) => setCreateState((prev) => ({ ...prev, category: nextCategory }))}
                  categories={categories}
                />
              </div>
              <div>
                <label className="label-base">Description</label>
                <textarea
                  className="input-base"
                  rows={3}
                  placeholder="e.g. Practice problems for beginners"
                  value={createState.description}
                  onChange={(e) => setCreateState((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-indigo-50 to-fuchsia-50 p-4 shadow-sm">
                <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-violet-300/25 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-fuchsia-300/20 blur-2xl" />
                <div className="relative">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">AI Assistant</p>
                  <p className="mt-1 text-sm font-semibold text-violet-950">Quiz generator</p>
                  <p className="mt-1 text-xs text-violet-700/90">Switch to Gemini to auto-create questions from your topic.</p>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-3 sm:items-start">
                  <div className="sm:col-span-1">
                    <label className="label-base text-violet-900">Provider</label>
                    <div className="relative mt-1">
                      <select
                        className="input-base appearance-none border-violet-200 bg-white/90 pr-10 focus:border-violet-500 focus:ring-violet-500/25"
                        value={createState.generatorProvider}
                        onChange={(e) => setCreateState((prev) => ({ ...prev, generatorProvider: e.target.value }))}
                      >
                        <option value="manual">Manual</option>
                        <option value="gemini">Gemini</option>
                      </select>
                      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-violet-600" />
                    </div>
                  </div>
                  <div
                    className={`contents transition-all duration-300 ease-out ${
                      createState.generatorProvider === "gemini"
                        ? "opacity-100"
                        : "pointer-events-none opacity-0"
                    }`}
                    aria-hidden={createState.generatorProvider !== "gemini"}
                  >
                    <div
                      className={`sm:col-span-1 overflow-hidden transition-all duration-300 ease-out ${
                        createState.generatorProvider === "gemini" ? "max-h-40 translate-y-0" : "max-h-0 -translate-y-1"
                      }`}
                    >
                      <label className="label-base text-violet-900">Question count</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        className="input-base mt-1 border-violet-200 bg-white/90 focus:border-violet-500 focus:ring-violet-500/25"
                        value={createState.generatorQuestionCount}
                        onChange={(e) =>
                          setCreateState((prev) => ({
                            ...prev,
                            generatorQuestionCount: Math.min(20, Math.max(1, Number(e.target.value) || 1)),
                          }))
                        }
                      />
                    </div>
                    <div
                      className={`sm:col-span-1 sm:self-end overflow-hidden transition-all duration-300 ease-out ${
                        createState.generatorProvider === "gemini" ? "max-h-40 translate-y-0" : "max-h-0 -translate-y-1"
                      }`}
                    >
                      <button
                        type="button"
                        className="btn-base w-full cursor-not-allowed bg-gradient-to-r from-violet-400 to-indigo-400 text-white opacity-75"
                        aria-disabled="true"
                        onClick={() =>
                          setCreateMessage("AI generation is temporarily unavailable. The owner currently has no budget yet for this API.")
                        }
                      >
                        Generate with Gemini
                      </button>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-violet-700/90">
                  {createState.generatorProvider === "gemini"
                    ? "This feature will be fully available soon. The owner currently has no budget yet for this API."
                    : "Manual mode is active. Add your own questions below and publish when ready."}
                </p>
              </div>
              <div className="space-y-3">
                {createState.questions.map((question, qIndex) => {
                  const qKind = question.kind === "tf" ? "tf" : question.kind === "fill" ? "fill" : "mcq";
                  return (
                  <div key={`q-${qIndex}`} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">Question {qIndex + 1}</p>
                      {createState.questions.length > 1 && <button type="button" className="text-xs text-brand-primary" onClick={() => removeQuestion(qIndex)}>Remove</button>}
                    </div>
                    <input className="input-base mb-2" placeholder="Question text" value={question.text} onChange={(e) => updateQuestionField(qIndex, "text", e.target.value)} required />
                    <div className="mb-3">
                      <p className="label-base mb-2">Answer type</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setQuestionKind(qIndex, "mcq")}
                          className={`rounded-xl px-3 py-2 text-sm ${qKind === "mcq" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"}`}
                        >
                          Multiple choice
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestionKind(qIndex, "tf")}
                          className={`rounded-xl px-3 py-2 text-sm ${qKind === "tf" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"}`}
                        >
                          True / false
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestionKind(qIndex, "fill")}
                          className={`rounded-xl px-3 py-2 text-sm ${qKind === "fill" ? "bg-brand-soft text-brand-primary ring-1 ring-brand-border" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"}`}
                        >
                          Fill in the blank
                        </button>
                      </div>
                      <p className="mt-1.5 text-xs text-neutral-500">
                        {qKind === "mcq"
                          ? "Starts with four answer choices. Use Add option if you need more."
                          : qKind === "tf"
                            ? "Two choices, True and False by default—you can edit the labels if needed."
                            : "Players type the answer. Grading ignores uppercase vs lowercase."}
                      </p>
                    </div>
                    {qKind === "fill" ? (
                      <div>
                        <label className="label-base">Correct answer</label>
                        <input
                          className="input-base mt-1"
                          placeholder="e.g. Paris"
                          value={question.blankAnswer ?? ""}
                          onChange={(e) => updateQuestionField(qIndex, "blankAnswer", e.target.value)}
                          required
                        />
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {question.options.map((option, optIndex) => (
                            <div key={`q-${qIndex}-o-${optIndex}`} className="flex items-center gap-2">
                              <input type="radio" name={`correct-${qIndex}`} checked={question.correctOptionIndex === optIndex} onChange={() => updateQuestionField(qIndex, "correctOptionIndex", optIndex)} />
                              <input
                                className="input-base min-w-0 flex-1"
                                placeholder={qKind === "tf" ? (optIndex === 0 ? "True" : "False") : `Option ${optIndex + 1}`}
                                value={option}
                                onChange={(e) => updateOption(qIndex, optIndex, e.target.value)}
                                required
                              />
                              {qKind === "mcq" && question.options.length > 2 && (
                                <button
                                  type="button"
                                  className="shrink-0 text-xs text-neutral-500 hover:text-rose-600"
                                  onClick={() => removeQuestionOption(qIndex, optIndex)}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        {qKind === "mcq" && (
                          <button type="button" className="btn-secondary mt-2 w-full sm:w-auto" onClick={() => addQuestionOption(qIndex)}>
                            Add option
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={addQuestion}>Add Question</button>
              {createMessage && (
                <p
                  className={`text-sm font-medium ${createMessage.includes("success") ? "text-emerald-700" : "text-rose-700"}`}
                >
                  {createMessage}
                </p>
              )}
              <button type="submit" className="btn-primary w-full" disabled={createLoading}>{createLoading ? "Publishing..." : "Publish Quiz"}</button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
