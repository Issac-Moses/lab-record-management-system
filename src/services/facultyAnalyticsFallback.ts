export type FallbackStudent = {
  name: string;
  regNo: string;
  completed: number;
  total: number;
  avgMarks: number;
};

export type FallbackAnalyticsData = {
  students: FallbackStudent[];
  experiments: string[];
  experimentProgress: Array<{ experiment: string; count: number; completion: number }>;
  weeklyTrend: Array<{ day: string; submissions: number }>;
  submissionStatus: Array<{ name: string; value: number; color: string }>;
  leaderboard: Array<{
    leaderboardRank: number;
    studentName: string;
    registerNumber: string;
    progressPercentage: number;
    totalMarks: number;
    avgAiScore: number | null;
  }>;
  summaryCards: Array<{ label: string; value: number; accent: string; suffix?: string }>;
  insights: string[];
  superDashboardRows: Array<{
    studentName: string;
    registerNumber: string;
    department: string;
    subject: string;
    totalExperiments: number;
    completedExperiments: number;
    progressPercentage: number;
    totalMarks: number;
    avgAiScore: number;
    leaderboardRank: number;
  }>;
};

const defaultStudents: FallbackStudent[] = [];

const defaultExperiments = [
  "Exp 1: TensorFlow Basics",
  "Exp 2: Perceptron Model",
  "Exp 3: Backpropagation",
  "Exp 4: CNN Model",
  "Exp 5: RNN Model",
  "Exp 6: LSTM",
  "Exp 7: Image Classification",
  "Exp 8: NLP",
  "Exp 9: Transfer Learning",
  "Exp 10: Optimization",
];

export function getFacultyAnalyticsFallback(subjectName = "Neural Networks and Deep Learning Lab"): FallbackAnalyticsData {
  const experimentCounts = [8, 6, 7, 5, 6, 7, 8, 6, 7, 5];
  const weeklySubmissions = [5, 8, 6, 9, 7, 10];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const experimentProgress = defaultExperiments.map((experiment, index) => ({
    experiment,
    count: experimentCounts[index] || 0,
    completion: Math.min(Math.round(((experimentCounts[index] || 0) / 10) * 100), 100),
  }));

  const weeklyTrend = days.map((day, index) => ({
    day,
    submissions: weeklySubmissions[index] || 0,
  }));

  const submissionStatus = [
    { name: "Completed", value: 70, color: "#059669" },
    { name: "Pending", value: 30, color: "#F59E0B" },
  ];

  const leaderboard = defaultStudents.map((student, index) => ({
    leaderboardRank: index + 1,
    studentName: student.name,
    registerNumber: student.regNo,
    progressPercentage: Math.round((student.completed / student.total) * 100),
    totalMarks: student.avgMarks,
    avgAiScore: null,
  }));

  const summaryCards = [
    { label: "Total Experiments", value: 10, accent: "bg-blue-100 text-blue-600" },
    { label: "Total Submissions", value: 72, accent: "bg-indigo-100 text-indigo-600" },
    { label: "Average Marks", value: 78, accent: "bg-emerald-100 text-emerald-600", suffix: "%" },
    { label: "Completion Rate", value: 70, accent: "bg-amber-100 text-amber-700", suffix: "%" },
  ];

  const insights = [
    "3 students below 60% completion",
    "Exp 4 (CNN) has lowest performance",
    "Peak submissions on Friday",
    "12 submissions pending review",
  ];

  const superDashboardRows = defaultStudents.map((student, index) => ({
    studentName: student.name,
    registerNumber: student.regNo,
    department: "IT",
    subject: subjectName,
    totalExperiments: student.total,
    completedExperiments: student.completed,
    progressPercentage: Math.round((student.completed / student.total) * 100),
    totalMarks: student.avgMarks,
    avgAiScore: student.avgMarks,
    leaderboardRank: index + 1,
  }));

  return {
    students: defaultStudents,
    experiments: defaultExperiments,
    experimentProgress,
    weeklyTrend,
    submissionStatus,
    leaderboard,
    summaryCards,
    insights,
    superDashboardRows,
  };
}
