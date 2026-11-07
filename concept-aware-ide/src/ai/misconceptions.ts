
export type Misconception = {
    id: string;
    title: string;
    explanation: string;
    question: string;
    hint: string;
  };
  
  export function detectMisconception(
    output: string
  ): Misconception | null {
    if (output.includes("IndexError")) {
      return {
        id: "index-error",
        title: "Possible List Indexing Misconception",
        explanation:
          "This error may involve how Python list indices work.",
        question:
          "If a list contains 3 elements, what indices can you use to access them?",
        hint:
          "Python starts counting list indices at 0, not 1. Think about the index of the final element.",
      };
    }
  
    if (output.includes("ZeroDivisionError")) {
      return {
        id: "zero-division",
        title: "Possible Division Misconception",
        explanation:
          "This error may involve understanding division by zero.",
        question:
          "Why do you think Python cannot calculate a number divided by zero?",
        hint:
          "Think about what division means: how many times does the divisor fit into the dividend?",
      };
    }
  
    if (output.includes("TypeError")) {
      return {
        id: "type-error",
        title: "Possible Data Type Misconception",
        explanation:
          "This error may involve incompatible data types.",
        question:
          "What is the difference between the number 5 and the string '5' in Python?",
        hint:
          "Python treats numbers and strings differently. Consider which operations each type supports.",
      };
    }
  
    return null;
  }
  