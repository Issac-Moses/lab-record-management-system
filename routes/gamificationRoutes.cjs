const express = require("express");
const {
  getUserProgress,
  addXP,
  incrementLabCompletion,
  syncStudentProgressFromSubmissions,
  getLeaderboard,
  getDepartmentGamificationStats,
  rewardSubmission,
  FACULTY_REVIEW_XP_REWARD,
  createStudentTask,
  submitStudentTask,
  verifyStudentTask,
  performStudentTask,
  listTasksForStudent,
  listTasksCreatedBy,
  listAllTasksForAdmin,
  getGlobalTaskCompletions,
} = require("../services/gamificationService.cjs");
const { requireAuth, requireAnyRole, requireRole } = require("../middleware/authMiddleware.cjs");

const router = express.Router();

function safeErrorResponse(res, status, message, error) {
  return res.status(status).json({
    success: false,
    message,
    error: error || "Operation failed",
    data: null,
  });
}

function safeSuccessResponse(res, message, data) {
  return res.json({
    success: true,
    message,
    error: null,
    data: data || null,
  });
}

// --- Quests / assigned tasks (auth required) — register specific paths before :taskId ---

router.get("/tasks/me", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return safeErrorResponse(res, 403, "Only students can list assigned quests", "Forbidden");
    }
    const tasks = await listTasksForStudent(req.user.id);
    return safeSuccessResponse(res, "Quests loaded", tasks);
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to load quests", error?.message);
  }
});

router.get("/tasks/created", requireAuth, requireAnyRole("faculty", "admin"), async (req, res) => {
  try {
    const tasks = await listTasksCreatedBy(req.user.id);
    return safeSuccessResponse(res, "Created quests loaded", tasks);
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to load created quests", error?.message);
  }
});

router.get("/tasks/admin/all", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const department = String(req.query.department || "").trim();
    const tasks = await listAllTasksForAdmin({ department });
    return safeSuccessResponse(res, "All quests loaded", tasks);
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to load quests", error?.message);
  }
});

router.post("/tasks", requireAuth, requireAnyRole("faculty", "admin"), async (req, res) => {
  try {
    const studentId = String(req.body?.studentId || "").trim();
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const xpReward = Number(req.body?.xpReward ?? 50);
    const subjectId = req.body?.subjectId ? String(req.body.subjectId).trim() : null;

    if (!studentId || !title) {
      return safeErrorResponse(res, 400, "studentId and title are required", "Validation");
    }

    const task = await createStudentTask({
      studentId,
      assignedBy: req.user.id,
      title,
      description,
      xpReward,
      subjectId,
    });

    return safeSuccessResponse(res, "Quest assigned", task);
  } catch (error) {
    return safeErrorResponse(res, 400, "Failed to assign quest", error?.message);
  }
});

router.post("/tasks/:taskId/submit", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return safeErrorResponse(res, 403, "Only students can submit quests", "Forbidden");
    }
    const taskId = String(req.params.taskId || "").trim();
    const submissionNotes = req.body?.submissionNotes ? String(req.body.submissionNotes).trim() : null;
    const result = await submitStudentTask(taskId, req.user.id, submissionNotes);
    if (!result.ok) {
      return safeErrorResponse(res, 400, result.error || "Cannot submit quest", result.error);
    }
    return safeSuccessResponse(res, "Quest submitted successfully for verification", result);
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to submit quest", error?.message);
  }
});

router.post("/tasks/:taskId/verify", requireAuth, requireAnyRole("faculty", "admin"), async (req, res) => {
  try {
    const taskId = String(req.params.taskId || "").trim();
    const targetStudentId = req.body?.studentId ? String(req.body.studentId).trim() : null;
    
    // If it's a direct task, student_id is stored on the task. If global, it requires targetStudentId.
    const result = await verifyStudentTask(taskId, targetStudentId || req.user.id);
    if (!result.ok) {
      return safeErrorResponse(res, 400, result.error || "Cannot verify quest", result.error);
    }
    return safeSuccessResponse(res, "Quest verified and XP rewarded!", {
      progress: result.progress,
      newAchievements: result.newAchievements || [],
    });
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to verify quest", error?.message);
  }
});

router.post("/tasks/:taskId/perform", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return safeErrorResponse(res, 403, "Only students can perform quests", "Forbidden");
    }
    const taskId = String(req.params.taskId || "").trim();
    const result = await performStudentTask(taskId, req.user.id);
    if (!result.ok) {
      return safeErrorResponse(res, 400, result.error || "Cannot perform quest", result.error);
    }
    return safeSuccessResponse(res, "Quest status updated to performing", result);
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to perform quest", error?.message);
  }
});

router.get("/tasks/:taskId/completions", requireAuth, requireAnyRole("faculty", "admin"), async (req, res) => {
  try {
    const taskId = String(req.params.taskId || "").trim();
    const completions = await getGlobalTaskCompletions(taskId);
    return safeSuccessResponse(res, "Quest completions loaded", completions);
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to load quest completions", error?.message);
  }
});

/** Students only — updates profiles from submissions + student_experiments, then returns progress (leaderboard-safe). */
router.post("/sync-progress", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return safeErrorResponse(res, 403, "Only students can sync lab progress", "Forbidden");
    }
    const progress = await syncStudentProgressFromSubmissions(req.user.id);
    return safeSuccessResponse(res, "Progress synced", progress);
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to sync progress", error?.message);
  }
});

router.get("/progress/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!userId) {
      return safeErrorResponse(res, 400, "userId is required", "Missing userId");
    }

    const progress = await getUserProgress(userId);
    return safeSuccessResponse(res, "Progress loaded", progress);
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to load progress", error?.message);
  }
});

router.get("/leaderboard", async (req, res) => {
  try {
    const department = String(req.query.department || "").trim();
    const limit = Number(req.query.limit || 10);
    const roleParam = String(req.query.role || "student").trim().toLowerCase();
    const role = roleParam === "all" ? null : roleParam || "student";
    const leaderboard = await getLeaderboard(department || null, { limit, role });
    return safeSuccessResponse(res, "Leaderboard loaded", leaderboard);
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to load leaderboard", error?.message);
  }
});

/** Full aggregate XP/labs for a department (admin UI; service role). */
router.get("/stats", async (req, res) => {
  try {
    const department = String(req.query.department || "").trim();
    const stats = await getDepartmentGamificationStats(department || null);
    return safeSuccessResponse(res, "Gamification stats loaded", stats);
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to load gamification stats", error?.message);
  }
});

router.post("/reward-evaluation", async (req, res) => {
  try {
    const userId = String(req.body?.userId || "").trim();
    const reviewerUserId = String(req.body?.reviewerUserId || "").trim();
    const xpAmount = Number(req.body?.xpAmount ?? 50);

    if (!userId) {
      return safeErrorResponse(res, 400, "userId is required", "Missing userId");
    }

    const xpProgress = await addXP(userId, Number.isFinite(xpAmount) ? xpAmount : 50);
    const finalProgress = await incrementLabCompletion(userId);

    if (reviewerUserId && reviewerUserId !== userId) {
      await addXP(reviewerUserId, FACULTY_REVIEW_XP_REWARD);
    }

    return safeSuccessResponse(res, "Gamification reward applied", {
      xp_after_xp_reward: xpProgress?.xp_points ?? 0,
      progress: finalProgress,
    });
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to apply reward", error?.message);
  }
});

router.post("/reward-submission", async (req, res) => {
  try {
    const userId = String(req.body?.userId || "").trim();
    const marks = req.body?.marks;
    const reviewerUserId = String(req.body?.reviewerUserId || "").trim();

    if (!userId) {
      return safeErrorResponse(res, 400, "userId is required", "Missing userId");
    }

    const result = await rewardSubmission(userId, marks, { reviewerUserId });

    return safeSuccessResponse(res, "Submission reward applied", {
      progress: result,
      streak: result.streak,
      newAchievements: result.newAchievements || [],
    });
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to apply submission reward", error?.message);
  }
});

module.exports = router;
