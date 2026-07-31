const express = require("express");
const { getSupabaseClient } = require("../services/manualService.cjs");
const { requireAuth } = require("../middleware/roleMiddleware.cjs");

const router = express.Router();
const DAILY_LIMIT = 3;
const aiTutorUsageMap = new Map();

function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

function getUserAiUsage(userId) {
  const today = getTodayDateString();
  const key = `${userId}:${today}`;
  return aiTutorUsageMap.get(key) || 0;
}

function incrementUserAiUsage(userId) {
  const today = getTodayDateString();
  const key = `${userId}:${today}`;
  const current = aiTutorUsageMap.get(key) || 0;
  aiTutorUsageMap.set(key, current + 1);
  return current + 1;
}

function safeSuccessResponse(res, message, data = {}) {
  return res.status(200).json({
    success: true,
    message,
    data,
  });
}

function safeErrorResponse(res, status, message, error) {
  return res.status(status).json({
    success: false,
    message,
    error: error || message,
  });
}

/** GET /api/ai/usage - Returns today's remaining AI requests */
router.get("/usage", requireAuth, async (req, res) => {
  try {
    const userId = String(req.user?.id || "").trim();
    const role = String(req.user?.role || "student").trim().toLowerCase();
    const usedToday = getUserAiUsage(userId);
    const remainingRequests = Math.max(0, DAILY_LIMIT - usedToday);

    return safeSuccessResponse(res, "Fetched AI usage", {
      userId,
      role,
      usedToday,
      remainingRequests,
      totalLimit: DAILY_LIMIT,
    });
  } catch (error) {
    console.error("GET /api/ai/usage error:", error);
    return safeErrorResponse(res, 500, "Failed to fetch AI usage", error?.message);
  }
});

/** GET /api/ai/context/:experimentId - Returns analyzed experiment context */
router.get("/context/:experimentId", async (req, res) => {
  try {
    const { experimentId } = req.params;
    const supabase = getSupabaseClient();
    let expData = null;

    if (supabase && experimentId) {
      const { data } = await supabase
        .from("experiments")
        .select("id, title, experiment_no, due_date, subject_id, subjects(name, department, year, semester)")
        .eq("id", experimentId)
        .maybeSingle();
      if (data) expData = data;
    }

    return safeSuccessResponse(res, "Experiment context loaded", {
      experimentId,
      title: expData?.title || "Experiment Workspace",
      experimentNo: expData?.experiment_no || 1,
      subjectName: expData?.subjects?.name || "Lab Subject",
      department: expData?.subjects?.department || "Information Technology",
      year: expData?.subjects?.year || "3",
      semester: expData?.subjects?.semester || "5",
    });
  } catch (error) {
    console.error("GET /api/ai/context error:", error);
    return safeErrorResponse(res, 500, "Failed to fetch context", error?.message);
  }
});

/** GET /api/ai/questions/:experimentId - Dynamically returns "Students also ask" questions */
router.get("/questions/:experimentId", async (req, res) => {
  try {
    const title = String(req.query?.title || "this experiment").trim();
    const questions = [
      `What is the primary aim of ${title}?`,
      `Why is this algorithm or workflow preferred?`,
      `What happens if a step in the procedure is skipped?`,
      `How do I interpret the output and metrics?`,
      `What are the most common syntax or execution errors?`,
      `What is the key takeaway or observation for the record?`,
    ];
    return safeSuccessResponse(res, "Generated suggested questions", { questions });
  } catch (error) {
    console.error("GET /api/ai/questions error:", error);
    return safeErrorResponse(res, 500, "Failed to generate questions", error?.message);
  }
});

async function callGeminiApi(prompt, systemInstruction) {
  // Read ONLY from backend environment variable for strict security
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey || apiKey === "your_gemini_api_key_here" || apiKey.includes("your_gemini_api_key")) {
    return null; // Fallback to rule engine
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemInstruction}\n\nUser Question/Prompt: ${prompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn("Gemini API returned HTTP status:", response.status);
      return null;
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (candidateText && typeof candidateText === "string") {
      return candidateText.trim();
    }
    return null;
  } catch (err) {
    console.error("Gemini API request failed.");
    return null;
  }
}

/** POST /api/ai/ask - Main AI Tutor request handler for Student, Faculty, & Admin */
router.post("/ask", requireAuth, async (req, res) => {
  try {
    const userId = String(req.user?.id || "").trim();
    const role = String(req.body?.role || req.user?.role || "student").trim().toLowerCase();
    const prompt = String(req.body?.prompt || "").trim();
    const experimentTitle = String(req.body?.experimentTitle || "Experiment Workspace").trim();
    const aim = String(req.body?.aim || "").trim();
    const procedure = String(req.body?.procedure || "").trim();
    const codeLanguage = String(req.body?.codeLanguage || "Python").trim();
    const output = String(req.body?.output || "").trim();
    const expId = String(req.body?.expId || req.body?.experimentId || "").trim();
    const subjectId = String(req.body?.subjectId || "").trim();

    if (!prompt) {
      return safeErrorResponse(res, 400, "Prompt is required", "Missing prompt");
    }

    const usedToday = getUserAiUsage(userId);
    if (usedToday >= DAILY_LIMIT) {
      return safeSuccessResponse(res, "Limit reached", {
        limitReached: true,
        remainingRequests: 0,
        totalLimit: DAILY_LIMIT,
      });
    }

    let responseText = "";
    let systemInstruction = "";

    if (role === "faculty") {
      systemInstruction = `You are a Faculty AI Assistant for an engineering college lab record system. Help the professor generate teaching notes, viva questions, student difficulty analysis, or discussion points for experiment: "${experimentTitle}". Format your answer cleanly in markdown with headings and bullet points.`;
    } else if (role === "admin") {
      systemInstruction = `You are an Admin AI Assistant for an engineering college lab record system. Provide administrative insights, usage analysis, and manual improvement recommendations for experiment: "${experimentTitle}". Format in markdown.`;
    } else {
      systemInstruction = `You are a Socratic AI Tutor for an engineering college lab record system for the experiment "${experimentTitle}" (${codeLanguage}). Aim: "${aim}". Procedure: "${procedure}". Current output: "${output}".
CRITICAL RULE: DO NOT provide complete full solution code or complete ready-to-submit script. Instead, explain concepts, give step-by-step logic, provide hints, or explain syntax/runtime errors SOCRATICALLY so the student learns without cheating. Format your response cleanly in markdown.`;
    }

    // Try live Gemini API first if configured
    const geminiResult = await callGeminiApi(prompt, systemInstruction);
    if (geminiResult) {
      responseText = geminiResult;
    } else {
      // Socratic Rule-Based Engine Fallback
      const promptLower = prompt.toLowerCase();

      if (role === "faculty") {
        if (promptLower.includes("viva") || promptLower.includes("questions")) {
          responseText = `🎓 **Suggested Viva Questions for ${experimentTitle}**\n\n1. What is the fundamental theoretical objective of this experiment?\n2. Explain the purpose of key imports and data transformations in ${codeLanguage}.\n3. How would you handle potential input noise or runtime edge cases?\n4. What evaluation metric best measures success for this task?`;
        } else if (promptLower.includes("teaching") || promptLower.includes("notes") || promptLower.includes("difficult")) {
          responseText = `📚 **Faculty Teaching Notes & Concepts**\n\n**Key Difficulties for Students**:\n- Confusion between hyperparameter initialization vs model compilation.\n- Proper data shape matching before feeding inputs.\n\n**Suggested Discussion Points**:\n- Ask students to explain *why* the algorithm behaves deterministically or probabilistically.\n- Highlight real-world production applications.`;
        } else {
          responseText = `👨‍🏫 **Faculty AI Assistant**: ${prompt}\n\n**Experiment**: ${experimentTitle}\n\n- **Prerequisites**: Verify students understand baseline array structures and functions in ${codeLanguage}.\n- **Common Mistakes**: Expect index errors and unhandled missing data inputs.`;
        }
      } else if (role === "admin") {
        if (promptLower.includes("confuse") || promptLower.includes("most asked") || promptLower.includes("stat")) {
          responseText = `📊 **Admin AI Analytics**\n\n- **Most Frequently Asked AI Topics**: Output interpretation, Shape Mismatch Errors, Algorithm Logic.\n- **Daily Usage Trend**: Peak student queries occur between 2 PM - 6 PM.\n- **Suggested Manual Improvements**: Add clearer sample output diagrams to **${experimentTitle}**.`;
        } else {
          responseText = `📈 **Admin AI Overview**: ${prompt}\n\n- **System Status**: AI Tutor module operating within strict daily limits.\n- **Subject Insights**: High engagement in neural network and deep learning lab manuals.`;
        }
      } else {
        const isDirectAnswerDemand =
          promptLower.includes("give code") ||
          promptLower.includes("write full code") ||
          promptLower.includes("complete code for me") ||
          promptLower.includes("solve experiment");

        if (isDirectAnswerDemand) {
          responseText = `💡 **AI Tutor Educational Guidance**\n\nI can help you understand the concepts, theory, and logic behind **${experimentTitle}**, but I cannot write the full solution code for you!\n\nHere is how you can approach it yourself:\n\n1. **Review Aim & Objective**: Understand what input data you are working with.\n2. **Break Down Logic**: Identify required functions, imports, or preprocessing steps.\n3. **Test Incrementally**: Use the Monaco code editor & execution terminal to test each function step-by-step.\n\nAsk me if you need help explaining specific errors, formulas, or algorithmic concepts!`;
        } else if (promptLower.includes("aim")) {
          responseText = `🎯 **Understanding the Aim of ${experimentTitle}**\n\n**Primary Objective**:\n${aim || "The objective of this lab experiment is to build, execute, and analyze key concepts and algorithms in " + experimentTitle + "."}\n\n**Key Takeaways**:\n- Understand theoretical foundations and implementation pipeline.\n- Observe output metrics and evaluate system accuracy.\n- Practice debugging and code execution in ${codeLanguage}.`;
        } else if (promptLower.includes("theory")) {
          responseText = `📚 **Theoretical Foundation**\n\n**Experiment**: ${experimentTitle}\n\n**Core Concepts**:\n- **Domain Logic**: Modern computational models use structured pipelines to process input features, transform parameters, and derive predictions.\n- **Language/Framework**: ${codeLanguage} provides specialized libraries and mathematical operations optimized for performance.\n- **Performance Evaluation**: Results are verified by comparing actual execution output against baseline expected behavior.`;
        } else if (promptLower.includes("procedure")) {
          responseText = `⚙️ **Step-by-Step Procedure**\n\n${procedure || "1. Initialize environment and import required libraries.\n2. Prepare input data and define problem parameters.\n3. Implement core model/logic steps.\n4. Execute program and capture console output.\n5. Analyze results and verify correctness."}\n\n**Execution Checklist**:\n- Ensure all syntax is valid before running.\n- Inspect the output panel for any runtime warnings or errors.`;
        } else if (promptLower.includes("algorithm")) {
          responseText = `📝 **Algorithm & Logical Steps**\n\n1. **Initialization**: Set up necessary parameters and data structures.\n2. **Input Processing**: Read and clean incoming data/inputs.\n3. **Core Computation**: Apply formulas, loop transformations, or neural network layers.\n4. **Evaluation**: Compute output metrics and performance loss.\n5. **Return**: Format final results for display.`;
        } else if (promptLower.includes("output")) {
          responseText = `📊 **Output Interpretation**\n\n${output ? "Current Console Output:\n```\n" + output.slice(0, 250) + "\n```\n" : ""}\n**How to Verify Output**:\n- Look for expected values, loss values, or classification metrics.\n- Ensure no exceptions or tracebacks were produced.\n- Verify execution time and memory limits.`;
        } else if (promptLower.includes("error")) {
          responseText = `❌ **Common Errors & Debugging Hints**\n\n1. **SyntaxError / IndentationError**: Double-check colon placement and line indentation in ${codeLanguage}.\n2. **NameError / ImportError**: Verify that all required modules/variables are declared before invocation.\n3. **TypeError / Shape Mismatch**: Ensure array dimensions and variable types match expected parameters.\n4. **Execution Timeout**: Check for infinite loops or heavy computations.`;
        } else if (promptLower.includes("tensorflow") || promptLower.includes("model")) {
          responseText = `🤖 **TensorFlow & Deep Learning Workflow**\n\n- **Model Architecture**: Use Sequential or Functional API to stack Dense / Conv2D / Dropout layers.\n- **Compilation**: Specify optimizer (\`adam\`, \`sgd\`), loss function (\`categorical_crossentropy\`, \`mse\`), and tracking metrics.\n- **Training**: Execute \`model.fit()\` with specified epochs and batch size.\n- **Evaluation**: Use \`model.evaluate()\` or inspect loss curves to detect overfitting.`;
        } else if (promptLower.includes("hint")) {
          responseText = `💡 **Socratic Hint**\n\nFocus on the core logic: what transformation needs to happen to turn your input into the target output? Try printing intermediate values or breaking your code into smaller functions!`;
        } else {
          responseText = `💬 **AI Tutor Guidance**: ${prompt}\n\n**Context**: ${experimentTitle}\n\nFor **${experimentTitle}**, keep in mind:\n- Ensure your Aim and Procedure match the required experimental workflow.\n- Check loop bounds and data types in ${codeLanguage}.\n- Use the execution terminal to test your logic incrementally.`;
        }
      }
    }

    const newUsage = incrementUserAiUsage(userId);
    const remainingRequests = Math.max(0, DAILY_LIMIT - newUsage);

    // Save request to Supabase tables `ai_tutor_requests` and `daily_ai_usage` if available
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const today = getTodayDateString();
        await supabase.from("ai_tutor_requests").insert({
          user_id: userId,
          role,
          experiment_id: expId || null,
          subject_id: subjectId || null,
          prompt,
          response: responseText,
          created_at: new Date().toISOString(),
        }).catch(() => null);

        await supabase.from("daily_ai_usage").upsert({
          user_id: userId,
          role,
          request_date: today,
          request_count: newUsage,
        }).catch(() => null);
      }
    } catch (_dbErr) {
      /* non-blocking */
    }

    return safeSuccessResponse(res, "AI Tutor response generated", {
      answer: responseText,
      remainingRequests,
      totalLimit: DAILY_LIMIT,
      limitReached: remainingRequests === 0,
    });
  } catch (error) {
    console.error("POST /api/ai/ask error:", error);
    return safeErrorResponse(res, 500, "Failed to generate AI Tutor response", error?.message);
  }
});

module.exports = router;
