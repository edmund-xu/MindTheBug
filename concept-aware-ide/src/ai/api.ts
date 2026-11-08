
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


    export type GeneratedCode = {
        code: string;
        explanation: string;
        question: string;
    };
    
    export async function generateCode(
        request: string
    ): Promise<GeneratedCode> {
        const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ request }),
        });
    
        if (!response.ok) {
        throw new Error("Failed to generate code");
        }
    
        return response.json();
    }  

export async function requestHint(
    code: string,
    question: string
  ): Promise<string> {
    const response = await fetch("/api/hint", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, question }),
    });
  
    if (!response.ok) {
      throw new Error("Failed to generate hint");
    }
  
    const data: { hint: string } = await response.json();
  
    return data.hint;
  }
  
    