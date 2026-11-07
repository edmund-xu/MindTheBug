export type AIAnalysis = {
    title: string;
    explanation: string;
    question: string;
  };
  
  export type AIEvaluation = {
    understanding: "correct" | "partial" | "incorrect";
    feedback: string;
    hint: string;
  };
  
  export async function analyzeCode(
    code: string,
    output: string
  ): Promise<AIAnalysis> {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, output }),
    });
  
    if (!response.ok) {
      throw new Error("Failed to analyze code");
    }
  
    return response.json();
  }
  
  export async function evaluateAnswer(
    code: string,
    question: string,
    answer: string
  ): Promise<AIEvaluation> {
    const response = await fetch("/api/evaluate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, question, answer }),
    });
  
    if (!response.ok) {
      throw new Error("Failed to evaluate answer");
    }
  
    return response.json();
  }
  