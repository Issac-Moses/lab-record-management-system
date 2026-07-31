# Exam System - Complete Logic Failures & Error Review

**Date**: February 27, 2026  
**Status**: Critical Issues Identified  

---

## 🔴 CRITICAL ISSUES

### 1. **Multiple Entry Points with Inconsistent Flow**

#### Problem:
There are **3 different exam entry systems** with conflicting logic:

- **StudentExam.tsx** (route: `/exam/start`)
- **StudentExamJoin.tsx** (route: not routed)
- **ExamJoin.tsx** (route: not routed)
- **ExamLogin.tsx** (route: `/exam/login`)
- **ExamWorkspace.tsx** (route: `/exam/workspace/:examId`)
- **StudentExamSession.tsx** (route: `/exam/session`)

#### Issues:
- **App.tsx routes**:
  - `/exam/start` → StudentExam
  - `/exam/session` → StudentExam (duplicate!)
  - `/exam/login` → ExamLogin
  - `/exam/workspace/:examId` → ExamWorkspace

- StudentExamJoin.tsx and ExamJoin.tsx **are not routed** but exist in codebase
- Multiple components trying to handle the same flow

#### Impact:
- User confusion
- Data inconsistency
- Multiple storage mechanisms (localStorage vs sessionStorage)

---

### 2. **Storage Key Inconsistencies**

#### StudentExam.tsx uses:
```javascript
localStorage.getItem("exam_id")
localStorage.getItem("exam_student_name")
localStorage.getItem("exam_register_no")
localStorage.getItem("exam_submitted")
localStorage.getItem("exam_running")
```

#### StudentExamSession.tsx uses:
```javascript
sessionStorage.getItem("exam_id")
sessionStorage.getItem("student_name")  // Different key!
sessionStorage.getItem("register_no")   // Different key!
```

#### ExamLogin.tsx uses:
```javascript
localStorage.setItem("exam_id", exam.id)
localStorage.setItem("exam_subject_id", exam.subject_id)
localStorage.setItem("exam_student_name", normalizedStudentName)
localStorage.setItem("exam_register_no", normalizedRegisterNo)
```

#### StudentExamJoin.tsx uses:
```javascript
sessionStorage.setItem("exam_id", exam.id)
sessionStorage.setItem("student_name", name)      // Different!
sessionStorage.setItem("register_no", regNo)       // Different!
```

**Result**: Different pages cannot communicate properly!

---

### 3. **Missing Authentication Check in StudentExam.tsx**

#### Location: `StudentExam.tsx` line 106-123

```typescript
const { data: submission } = await supabase
  .from("exam_submissions")
  .select("id")
  .eq("exam_id", examId)
  .eq("register_no", registerNo)  // Using register_no
  .maybeSingle();
```

**Problem**: No `student_id` check! A student can use **another student's register number** and it will show "already submitted".

#### Fix needed:
```typescript
const { data: { user } } = await supabase.auth.getUser();
const { data: submission } = await supabase
  .from("exam_submissions")
  .select("id")
  .eq("exam_id", examId)
  .eq("register_no", registerNo)
  .eq("student_id", user.id)  // ADD THIS!
  .maybeSingle();
```

---

### 4. **Submission Duplication Logic Failure**

#### Issue in StudentExam.tsx (lines 316-337):

```typescript
const handleSubmit = async (auto = false) => {
  if (!exam || !examId || hasSubmittedRef.current || submitting) return;
  
  // Check 1: Check existing submission
  const { data: existing } = await supabase
    .from("exam_submissions")
    .select("id")
    .eq("exam_id", examId)
    .eq("register_no", normalizedRegisterNo)
    .maybeSingle();

  if (existing) {
    // ... navigate away
    return;
  }

  hasSubmittedRef.current = true;  // Set here
  setSubmitting(true);

  // Get user (could fail!)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    hasSubmittedRef.current = false;  // Reset on failure
    setSubmitting(false);
    setError("User not authenticated");
    return;
  }

  // Insert submission
  const { error: submitError } = await supabase
    .from("exam_submissions")
    .insert({...});
```

**Race Condition**: Between "check existing" and "insert", another tab could submit!

#### Better approach:
Use database constraint (already added in `strict-exam-mode.sql`) and handle unique violation error:

```typescript
const { error: submitError } = await supabase
  .from("exam_submissions")
  .insert({...});

if (submitError) {
  if (submitError.code === '23505') { // Unique violation
    // Already submitted
    localStorage.setItem("exam_submitted", "true");
    navigate("/exam/submitted");
    return;
  }
  // Handle other errors
}
```

---

### 5. **Student ID Missing in Multiple Submissions**

#### StudentExamSession.tsx (line 107-114):
```typescript
const { error: submitError } = await supabase
  .from("exam_submissions")
  .insert({
    exam_id: examId,
    exp_id: selectedExpId,
    student_name: studentName,
    register_no: registerNo,
    program,
    output,
    submitted_at: new Date().toISOString(),
    // student_id: MISSING!
    // device_id: MISSING!
    // ip_address: MISSING!
  });
```

**Problem**: No student_id, device_id, or ip_address tracking!

---

### 6. **Timer Logic Race Conditions**

#### Multiple timer effects in StudentExam.tsx:

**Effect 1** (lines 418-432): Countdown timer
```typescript
useEffect(() => {
  if (alreadySubmitted || timeLeft <= 0 || hasSubmittedRef.current) return;
  const timer = window.setInterval(() => {
    setTimeLeft((prev) => {
      if (prev <= 1) {
        window.clearInterval(timer);
        return 0;
      }
      return prev - 1;
    });
  }, 1000);
  return () => window.clearInterval(timer);
}, [alreadySubmitted, timeLeft]);
```

**Effect 2** (lines 434-439): Auto-submit on timeout
```typescript
useEffect(() => {
  if (timeLeft <= 0 && !alreadySubmitted && !hasSubmittedRef.current) {
    void logEvent("time_expired");
    void handleSubmit(true);
  }
}, [alreadySubmitted, timeLeft]);
```

**Problem**: `handleSubmit` is not in dependencies! This could cause stale closure issues.

---

### 7. **Exam Active Check Logic Failure**

#### StudentExam.tsx (lines 297-314):
```typescript
const roomId = exam?.room_id || "";

const checkExamStatus = async () => {
  if (!roomId) {
    setExamActive(false);
    return;
  }

  const { data } = await supabase
    .rpc("get_active_exam", { room_code: roomId })
    .maybeSingle();

  if (!data) {
    setExamActive(false);
  } else {
    setExamActive(true);
  }
};
```

**Problem**: `get_active_exam` RPC function is called but **may not exist** in database! No error handling.

---

### 8. **Fullscreen Logic Issues**

#### StudentExam.tsx (lines 247-263):
```typescript
useEffect(() => {
  if (!exam || hasSubmittedRef.current) return;
  void document.documentElement.requestFullscreen().catch(() => {});
}, [exam?.id]);

useEffect(() => {
  const handleFullscreenChange = () => {
    if (!document.fullscreenElement && !hasSubmittedRef.current) {
      void logEvent("fullscreen_exit");
    }
  };

  document.addEventListener("fullscreenchange", handleFullscreenChange);
  return () => {
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
  };
}, [examId, registerNo]);
```

**Problems**:
- Fullscreen is requested but **not enforced**
- No re-request on fullscreen exit
- Just logs the event, doesn't take action

---

### 9. **Violation Termination Has Dependency Issue**

#### StudentExam.tsx (lines 208-223):
```typescript
useEffect(() => {
  if (violations === 1) {
    window.alert("Warning: Do not switch tabs during exam");
  }

  if (violations >= 3 && !violationTerminatedRef.current) {
    violationTerminatedRef.current = true;
    void (async () => {
      window.alert("Exam terminated due to multiple tab switches");
      if (!alreadySubmitted && !hasSubmittedRef.current) {
        await handleSubmit(true);
      }
      navigate("/student");
    })();
  }
}, [alreadySubmitted, violations, navigate]);
```

**Problem**: `handleSubmit` is not in dependencies! This is a **missing dependency** that ESLint would flag.

---

### 10. **Experiment Loading Fails Silently**

#### StudentExam.tsx (lines 272-295):
```typescript
useEffect(() => {
  const loadExperiments = async () => {
    if (!exam?.subject_id) return;

    const { data, error: fetchError } = await supabase
      .from("experiments")
      .select("id, experiment_no, title")
      .eq("subject_id", exam.subject_id)
      .order("experiment_no");

    if (fetchError) {
      setError(fetchError.message);  // Sets error
      return;
    }

    const list = (data || []) as ExperimentRow[];
    setExperiments(list);
    if (list.length > 0) {
      setSelectedExpId(String(list[0].id));
    }
  };

  void loadExperiments();
}, [exam?.subject_id]);
```

**Problem**: If experiments list is empty, user can still submit with `selectedExpId = ""`, which might cause issues.

---

### 11. **ExamWorkspace Missing Timer Sync**

#### ExamWorkspace.tsx (lines 318-334):
```typescript
useEffect(() => {
  if (!exam) return;

  const endTime = new Date(exam.end_time).getTime();
  const timerId = window.setInterval(() => {
    const remaining = endTime - Date.now();
    setRemainingMs(remaining);

    if (remaining <= 0) {
      window.clearInterval(timerId);
      void logEvent("auto_submit");
      void handleSubmit();
    }
  }, 1000);

  return () => window.clearInterval(timerId);
}, [exam, handleSubmit]);
```

**AND** another effect (lines 336-342):
```typescript
useEffect(() => {
  if (remainingMs <= 0 && exam && !submittingRef.current && !submittedRef.current) {
    void logEvent("time_expired");
    void logEvent("auto_submit");
    void handleSubmit();
  }
}, [exam, handleSubmit, logEvent, remainingMs]);
```

**Problem**: **Double submission** risk! Both effects can trigger `handleSubmit()`.

---

### 12. **ExamLogin Device Check Has Wrong Logic**

#### ExamLogin.tsx (lines 57-69):
```typescript
const { data: existingDeviceSubmissions } = await supabase
  .from("exam_submissions")
  .select("id")
  .eq("exam_id", exam.id)
  .eq("register_no", normalizedRegisterNo)
  .neq("device_id", deviceId)  // NOT EQUAL!
  .limit(1);

if ((existingDeviceSubmissions?.length ?? 0) > 0) {
  window.alert("You already joined this exam from another device");
  setLoading(false);
  return;
}
```

**Problem**: This checks if a submission exists with a **different device_id**. But what if:
- Student submits from Device A
- Student tries to login from Device A again
- This check **will pass** (because device_id matches)
- Student can re-enter exam!

**Fix**: Check if submission exists at all:
```typescript
const { data: existingSubmission } = await supabase
  .from("exam_submissions")
  .select("id")
  .eq("exam_id", exam.id)
  .eq("register_no", normalizedRegisterNo)
  .limit(1);

if (existingSubmission && existingSubmission.length > 0) {
  window.alert("You have already submitted this exam");
  navigate("/exam/submitted");
  return;
}
```

---

### 13. **StudentExamJoin Navigation Issue**

#### StudentExamJoin.tsx (line 163):
```typescript
navigate("/exam/session");
```

**Problem**: App.tsx routes `/exam/session` to **StudentExam.tsx**, but StudentExamJoin sets data in **sessionStorage** while StudentExam reads from **localStorage**!

**Result**: Data mismatch, exam won't load.

---

### 14. **ExamJoin Missing Student Details**

#### ExamJoin.tsx navigates to:
```typescript
navigate(`/exam/${exam.id}`);
```

But there's **no route** for `/exam/:id` in App.tsx!

---

### 15. **FacultyExams getExamStatus Logic**

#### FacultyExams.tsx (lines 31-39):
```typescript
function getExamStatus(startTime: string, endTime: string) {
  const now = Date.now();
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  if (now < start) return "Not Started";
  if (now > end) return "Completed";
  return "Active";
}
```

**Issue**: What if `startTime` or `endTime` are null/invalid? No validation!

---

### 16. **Missing Error Boundaries**

**None** of the exam components have error boundaries. If any component crashes, the entire exam session is lost.

---

### 17. **Auto-submit Loops**

#### StudentExam.tsx has:
1. Timer countdown effect
2. Time expired effect
3. Exam inactive effect

All three can potentially call `handleSubmit()`. If one fails, others might retry, causing **multiple submission attempts**.

---

### 18. **Tab Management Inconsistency**

#### StudentExam.tsx:
```typescript
const tabSessionKey = "exam_tab_id";
const examRunningKey = "exam_running";
```

#### ExamWorkspace.tsx:
```typescript
const examRunningKey = "exam_running";
const tabSessionKey = "exam_workspace_tab_id";  // Different key!
```

**Problem**: Two different systems can both think they're the "active" tab.

---

### 19. **Copy/Paste Block Doesn't Prevent Dev Tools**

#### StudentExam.tsx (lines 226-237):
```typescript
useEffect(() => {
  const block = (event: Event) => {
    event.preventDefault();
    void logEvent("copy_paste");
  };
  document.addEventListener("copy", block);
  document.addEventListener("paste", block);

  return () => {
    document.removeEventListener("copy", block);
    document.removeEventListener("paste", block);
  };
}, [examId, registerNo]);
```

**Reality**: Students can still:
- Use browser dev tools
- Inspect network requests
- Access localStorage/sessionStorage
- Screenshot (not blocked)
- Use external OCR tools

---

### 20. **Missing Student Authentication in ExamWorkspace**

#### ExamWorkspace.tsx loads user:
```typescript
const { data: { user } } = await supabase.auth.getUser();
```

But what if user is **not logged in**? The exam still loads! Only checks later at line 254.

---

## 🟡 MODERATE ISSUES

### 21. **Inconsistent Time Formatting**

- StudentExam.tsx: `MM:SS`
- StudentExamSession.tsx: `HH:MM:SS`
- ExamWorkspace.tsx: `HH:MM:SS`

---

### 22. **No Exam Resume Capability**

If a student's browser crashes or they lose internet, they **cannot resume** the exam. All progress is lost.

---

### 23. **Missing Loading States**

Many components don't show proper loading indicators during critical operations (submissions, fetching data).

---

### 24. **Debug Logs in Production Code**

StudentExamJoin.tsx (lines 23-36, 48-62, etc.) has hardcoded debug fetch calls:
```typescript
fetch("http://127.0.0.1:7701/ingest/963f19bf-5f65-4fbf-8283-6f330299209c", {
  method: "POST",
  // ...
});
```

**Problem**: This will fail in production and cause console errors.

---

## 🟢 MINOR ISSUES

### 25. **Inconsistent Button Styles**

Some use Tailwind classes, some use component library.

---

### 26. **Missing TypeScript Strict Checks**

Many `any` types and missing null checks.

---

### 27. **No Retry Logic**

Network failures cause immediate failures with no retry mechanism.

---

## 📋 RECOMMENDATIONS

### Immediate Fixes:
1. **Unify exam entry flow** - Remove duplicate components
2. **Standardize storage keys** - Use consistent naming
3. **Add student_id checks** - Prevent register number spoofing
4. **Fix race conditions** - Use database constraints
5. **Add error boundaries** - Prevent crash cascades
6. **Remove debug code** - Clean production code

### Short-term Improvements:
1. Add exam resume capability
2. Implement retry logic
3. Add comprehensive error handling
4. Standardize time formatting
5. Add TypeScript strict mode

### Long-term Enhancements:
1. Implement server-side proctoring
2. Add video monitoring
3. Implement answer encryption
4. Add automated integrity checks
5. Build admin dashboard for live monitoring

---

## 🎯 PRIORITY FIX LIST

### P0 (Critical - Fix Now):
1. Storage key inconsistencies
2. Missing student_id checks
3. Race condition in submission
4. Multiple entry points confusion
5. ExamLogin device check logic

### P1 (High - Fix This Week):
1. Timer logic race conditions
2. Auto-submit loops
3. Missing error boundaries
4. Experiment loading failures
5. Tab management inconsistency

### P2 (Medium - Fix This Sprint):
1. Fullscreen enforcement
2. Exam resume capability
3. Debug code removal
4. Loading state improvements
5. TypeScript strict checks

### P3 (Low - Backlog):
1. Button style standardization
2. Time format consistency
3. Retry logic
4. Enhanced monitoring
5. UI/UX polish

---

**End of Review**
