export type AIAnalysis = {
    title: string;
    explanation: string;
    question: string;
    confidence: "high" | "medium" | "low";
    reasoning: string;
    alternativeExplanation: string | null;
  };
  
  export type AIEvaluation = {
    understanding: "correct" | "partial" | "incorrect";
    feedback: string;
    hint: string;
    followUpQuestion: string | null;
  };
  
  // --------------------------------------------------
  // Shared API helper
  // --------------------------------------------------
  
  async function postJSON<T>(
    endpoint: string,
    payload: unknown
  ): Promise<T> {
    const response = await fetch(endpoint, {
      method: "POST",
  
      headers: {
        "Content-Type": "application/json",
      },
  
      body: JSON.stringify(payload),
    });
  
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
  
      try {
        const data: { error?: string } =
          await response.json();
  
        if (data.error) {
          message = data.error;
        }
      } catch {
        // Use the HTTP status message if no JSON is returned.
      }
  
      throw new Error(message);
    }
  
    return (await response.json()) as T;
  }
  
  // --------------------------------------------------
  // Feature 1: Misconception debugging
  // --------------------------------------------------
  
  export async function analyzeCode(
    code: string,
    output: string
  ): Promise<AIAnalysis> {
    return postJSON<AIAnalysis>("/api/analyze", {
      code,
      output,
    });
  }
  
  // --------------------------------------------------
  // Shared adaptive tutoring
  // --------------------------------------------------
  
  export async function evaluateAnswer(
    code: string,
    question: string,
    answer: string
  ): Promise<AIEvaluation> {
    return postJSON<AIEvaluation>("/api/evaluate", {
      code,
      question,
      answer,
    });
  }
  
  // --------------------------------------------------
  // Feature 4: Code insertion understanding check
  // --------------------------------------------------
  
  export async function generateInsertionQuestion(
    insertedCode: string,
    fullCode: string
  ): Promise<string> {
    const result = await postJSON<{ question: string }>(
      "/api/insertion-question",
      {
        insertedCode,
        fullCode,
      }
    );
  
    if (
      typeof result.question !== "string" ||
      !result.question.trim()
    ) {
      throw new Error("Invalid question response");
    }
  
    return result.question;
  }
  
  // --------------------------------------------------
  // Optional conceptual hint
  // --------------------------------------------------
  
  export async function requestHint(
    code: string,
    question: string
  ): Promise<string> {
    const result = await postJSON<{ hint: string }>(
      "/api/hint",
      {
        code,
        question,
      }
    );
  
    if (
      typeof result.hint !== "string" ||
      !result.hint.trim()
    ) {
      throw new Error("Invalid hint response");
    }
  
    return result.hint;
  }
  