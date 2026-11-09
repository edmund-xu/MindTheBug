import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

import {
  misconceptionPrompt,
  evaluationPrompt,
  insertionUnderstandingPrompt,
  hintPrompt,
} from "./prompts";

const app = express();
const PORT = 3001;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(cors());
app.use(express.json({ limit: "100kb" }));

// --------------------------------------------------
// Helpers
// --------------------------------------------------

type Understanding = "correct" | "partial" | "incorrect";
type Confidence = "high" | "medium" | "low";

function isNonEmptyString(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function isValidString(
  value: unknown,
  maxLength: number
): value is string {
  return (
    isNonEmptyString(value) &&
    value.length <= maxLength
  );
}

async function askAI(
  systemPrompt: string,
  payload: unknown
): Promise<Record<string, unknown>> {
  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",

    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify(payload),
      },
    ],

    response_format: {
      type: "json_object",
    },

    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("Empty AI response");
  }

  const parsed: unknown = JSON.parse(content);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error("Invalid AI JSON response");
  }

  return parsed as Record<string, unknown>;
}

function sendServerError(
  res: express.Response,
  error: unknown,
  message: string
) {
  console.error(message, error);

  res.status(500).json({
    error: message,
  });
}

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Concept-Aware Programming Support",
  });
});

// --------------------------------------------------
// Feature 1: Misconception debugging
// POST /api/analyze
// --------------------------------------------------

app.post("/api/analyze", async (req, res) => {
  try {
    const { code, output } = req.body ?? {};

    if (
      !isValidString(code, 20000) ||
      !isValidString(output, 20000)
    ) {
      res.status(400).json({
        error: "Valid code and execution output are required",
      });
      return;
    }

    const result = await askAI(
      misconceptionPrompt,
      {
        code,
        output,
      }
    );

    if (
      !isNonEmptyString(result.title) ||
      !isNonEmptyString(result.explanation) ||
      !isNonEmptyString(result.question)
    ) {
      throw new Error("Invalid misconception response");
    }

    const confidence: Confidence =
      result.confidence === "high" ||
      result.confidence === "medium" ||
      result.confidence === "low"
        ? result.confidence
        : "low";

    const reasoning =
      typeof result.reasoning === "string"
        ? result.reasoning
        : "The suggestion is based on the code and execution error.";

    const alternativeExplanation =
      typeof result.alternativeExplanation === "string"
        ? result.alternativeExplanation
        : null;

    res.json({
      title: result.title,
      explanation: result.explanation,
      question: result.question,
      confidence,
      reasoning,
      alternativeExplanation,
    });
  } catch (error) {
    sendServerError(
      res,
      error,
      "Failed to analyze Python code"
    );
  }
});

// --------------------------------------------------
// Shared adaptive tutoring
// POST /api/evaluate
// --------------------------------------------------

app.post("/api/evaluate", async (req, res) => {
  try {
    const { code, question, answer } = req.body ?? {};

    if (
      !isValidString(code, 20000) ||
      !isValidString(question, 2000) ||
      !isValidString(answer, 10000)
    ) {
      res.status(400).json({
        error: "Valid code, question, and answer are required",
      });
      return;
    }

    const result = await askAI(
      evaluationPrompt,
      {
        code,
        question,
        answer,
      }
    );

    if (
      !isNonEmptyString(result.feedback) ||
      !(
        result.understanding === "correct" ||
        result.understanding === "partial" ||
        result.understanding === "incorrect"
      )
    ) {
      throw new Error("Invalid evaluation response");
    }

    const understanding =
      result.understanding as Understanding;

    const hint =
      typeof result.hint === "string"
        ? result.hint
        : "";

    const followUpQuestion =
      understanding === "correct"
        ? null
        : isNonEmptyString(result.followUpQuestion)
          ? result.followUpQuestion
          : null;

    res.json({
      understanding,
      feedback: result.feedback,
      hint,
      followUpQuestion,
    });
  } catch (error) {
    sendServerError(
      res,
      error,
      "Failed to evaluate student understanding"
    );
  }
});

// --------------------------------------------------
// Feature 4: Code insertion understanding check
// POST /api/insertion-question
// --------------------------------------------------

app.post(
  "/api/insertion-question",
  async (req, res) => {
    try {
      const { insertedCode, fullCode } = req.body ?? {};

      if (
        !isValidString(insertedCode, 20000) ||
        !isValidString(fullCode, 50000)
      ) {
        res.status(400).json({
          error: "Valid inserted code and full code are required",
        });
        return;
      }

      const result = await askAI(
        insertionUnderstandingPrompt,
        {
          insertedCode,
          fullCode,
        }
      );

      if (!isNonEmptyString(result.question)) {
        throw new Error(
          "Invalid insertion question response"
        );
      }

      res.json({
        question: result.question,
      });
    } catch (error) {
      sendServerError(
        res,
        error,
        "Failed to generate insertion understanding question"
      );
    }
  }
);

// --------------------------------------------------
// Optional conceptual hints
// POST /api/hint
// --------------------------------------------------

app.post("/api/hint", async (req, res) => {
  try {
    const { code, question } = req.body ?? {};

    if (
      !isValidString(code, 20000) ||
      !isValidString(question, 2000)
    ) {
      res.status(400).json({
        error: "Valid code and question are required",
      });
      return;
    }

    const result = await askAI(
      hintPrompt,
      {
        code,
        question,
      }
    );

    if (!isNonEmptyString(result.hint)) {
      throw new Error("Invalid hint response");
    }

    res.json({
      hint: result.hint,
    });
  } catch (error) {
    sendServerError(
      res,
      error,
      "Failed to generate conceptual hint"
    );
  }
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `Concept-Aware IDE API running at http://localhost:${PORT}`
  );
});
