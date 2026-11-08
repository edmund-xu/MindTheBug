import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  analyzeCode,
  evaluateAnswer,
  generateCode,
} from "./ai/api";
import type {
  AIAnalysis,
  AIEvaluation,
  GeneratedCode,
} from "./ai/api";
import "./App.css";

const starterCode = `numbers = [10, 20, 30]

for i in range(3):
    print(numbers[i + 1])
`;

const MAX_QUESTIONS = 3;

type PythonResult = {
  success: boolean;
  output: string;
};

type Mode = "debug" | "generate";

type TutoringStatus =
  | "active"
  | "understood"
  | "skipped"
  | "needs-practice";

function App() {
  const [code, setCode] = useState(starterCode);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const [mode, setMode] = useState<Mode>("debug");

  const [analysis, setAnalysis] =
    useState<AIAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [generationRequest, setGenerationRequest] =
    useState("");
  const [generatedCode, setGeneratedCode] =
    useState<GeneratedCode | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [currentQuestion, setCurrentQuestion] =
    useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [studentAnswer, setStudentAnswer] = useState("");
  const [evaluation, setEvaluation] =
    useState<AIEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const [tutoringStatus, setTutoringStatus] =
    useState<TutoringStatus>("active");

  const [error, setError] = useState("");

  const workerRef = useRef<Worker | null>(null);
  const submittedCodeRef = useRef("");
  const modeRef = useRef<Mode>("debug");
  const requestVersionRef = useRef(0);

  modeRef.current = mode;

  function resetTutoring() {
    setCurrentQuestion("");
    setQuestionCount(0);
    setStudentAnswer("");
    setEvaluation(null);
    setTutoringStatus("active");
  }

  useEffect(() => {
    const worker = new Worker(
      new URL("./python.worker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = async (
      event: MessageEvent<PythonResult>
    ) => {
      const result = event.data;

      setOutput(result.output);
      setIsRunning(false);

      const hasPythonError =
        /(?:Traceback \(most recent call last\)|SyntaxError:|IndentationError:)/.test(
          result.output
        );

      if (
        !result.success ||
        !hasPythonError ||
        modeRef.current !== "debug"
      ) {
        return;
      }

      const version = requestVersionRef.current;
      const submittedCode = submittedCodeRef.current;

      setIsAnalyzing(true);

      try {
        const aiResult = await analyzeCode(
          submittedCode,
          result.output
        );

        if (version !== requestVersionRef.current) return;

        setAnalysis(aiResult);
        setCurrentQuestion(aiResult.question);
        setQuestionCount(1);
        setTutoringStatus("active");
      } catch (err) {
        if (version !== requestVersionRef.current) return;

        setError(
          err instanceof Error
            ? err.message
            : "AI analysis failed"
        );
      } finally {
        if (version === requestVersionRef.current) {
          setIsAnalyzing(false);
        }
      }
    };

    worker.onerror = () => {
      setOutput("Failed to initialize Python runtime.");
      setIsRunning(false);
      setError("Python worker failed.");
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  function changeMode(nextMode: Mode) {
    requestVersionRef.current += 1;

    setMode(nextMode);
    setAnalysis(null);
    setGeneratedCode(null);
    setIsAnalyzing(false);
    setError("");
    resetTutoring();
  }

  function runCode() {
    if (
      !workerRef.current ||
      isRunning ||
      isAnalyzing ||
      isGenerating
    ) {
      return;
    }

    requestVersionRef.current += 1;
    submittedCodeRef.current = code;

    setIsRunning(true);
    setOutput("Running Python...");
    setAnalysis(null);
    setIsAnalyzing(false);
    setError("");

    if (mode === "debug") {
      resetTutoring();
    }

    workerRef.current.postMessage(code);
  }

  async function handleGenerateCode() {
    if (
      !generationRequest.trim() ||
      isGenerating ||
      isRunning
    ) {
      return;
    }

    requestVersionRef.current += 1;
    const version = requestVersionRef.current;

    setIsGenerating(true);
    setError("");
    setGeneratedCode(null);
    setAnalysis(null);
    setOutput("");
    resetTutoring();

    try {
      const result = await generateCode(generationRequest);

      if (version !== requestVersionRef.current) return;

      setGeneratedCode(result);
      setCode(result.code);
      submittedCodeRef.current = result.code;

      setCurrentQuestion(result.question);
      setQuestionCount(1);
      setTutoringStatus("active");
    } catch (err) {
      if (version !== requestVersionRef.current) return;

      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate code"
      );
    } finally {
      if (version === requestVersionRef.current) {
        setIsGenerating(false);
      }
    }
  }

  async function checkUnderstanding() {
    if (
      !currentQuestion ||
      !studentAnswer.trim() ||
      isEvaluating ||
      tutoringStatus !== "active" ||
      evaluation
    ) {
      return;
    }

    const version = requestVersionRef.current;
    const question = currentQuestion;
    const answer = studentAnswer;

    setIsEvaluating(true);
    setError("");

    try {
      const result = await evaluateAnswer(
        submittedCodeRef.current,
        question,
        answer
      );

      if (version !== requestVersionRef.current) return;

      setEvaluation(result);

      if (result.understanding === "correct") {
        setTutoringStatus("understood");
      } else if (questionCount >= MAX_QUESTIONS) {
        setTutoringStatus("needs-practice");
      }
    } catch (err) {
      if (version !== requestVersionRef.current) return;

      setError(
        err instanceof Error
          ? err.message
          : "Evaluation failed"
      );
    } finally {
      if (version === requestVersionRef.current) {
        setIsEvaluating(false);
      }
    }
  }

  function continueTutoring() {
    if (
      !evaluation?.followUpQuestion ||
      questionCount >= MAX_QUESTIONS
    ) {
      return;
    }

    setCurrentQuestion(evaluation.followUpQuestion);
    setQuestionCount((count) => count + 1);
    setStudentAnswer("");
    setEvaluation(null);
    setTutoringStatus("active");
  }

  function skipTutoring() {
    requestVersionRef.current += 1;
    setTutoringStatus("skipped");
    setStudentAnswer("");
    setEvaluation(null);
    setIsEvaluating(false);
  }

  const hasTutoringQuestion =
    (mode === "debug" && analysis !== null) ||
    (mode === "generate" && generatedCode !== null);

  return (
    <div className="app">
      <header>
        <h2>Concept-Aware Programming Support</h2>
      </header>

      <main>
        <div className="mode-selector">
          <button
            className={mode === "debug" ? "active" : ""}
            onClick={() => changeMode("debug")}
          >
            Misconception Debugging
          </button>

          <button
            className={mode === "generate" ? "active" : ""}
            onClick={() => changeMode("generate")}
          >
            AI Code Assistance
          </button>
        </div>

        <section className="editor-panel">
          <h3>main.py</h3>

          <Editor
            height="450px"
            language="python"
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value ?? "")}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
            }}
          />

          <button
            onClick={runCode}
            disabled={
              isRunning || isAnalyzing || isGenerating
            }
          >
            {isRunning ? "Running..." : "Run Code"}
          </button>

          <h3>Output</h3>
          <pre>{output}</pre>
        </section>

        <section className="ai-panel">
          <h3>AI Concept Coach</h3>

          {mode === "debug" && (
            <>
              {isAnalyzing && (
                <p>Analyzing your code...</p>
              )}

              {!analysis && !isAnalyzing && (
                <p>
                  Run Python code containing an error
                  to receive conceptual guidance.
                </p>
              )}

              {analysis && (
                <div className="coach-content">
                  <h4>{analysis.title}</h4>
                  <p>{analysis.explanation}</p>
                </div>
              )}
            </>
          )}

          {mode === "generate" && (
            <>
              <h4>Generate Python Code</h4>

              <textarea
                rows={3}
                placeholder="Describe what you want the code to do..."
                value={generationRequest}
                onChange={(e) =>
                  setGenerationRequest(e.target.value)
                }
              />

              <button
                onClick={handleGenerateCode}
                disabled={
                  isGenerating ||
                  isRunning ||
                  !generationRequest.trim()
                }
              >
                {isGenerating
                  ? "Generating..."
                  : "Generate Code"}
              </button>

              {generatedCode && (
                <div className="coach-content">
                  <h4>AI-Generated Code</h4>
                  <p>{generatedCode.explanation}</p>
                  <p>
                    The generated code has been inserted
                    into the editor.
                  </p>
                </div>
              )}
            </>
          )}

          {hasTutoringQuestion && (
            <div className="coach-content">

              {tutoringStatus === "active" && (
                <>
                  <p className="question-progress">
                    Question {questionCount} of {MAX_QUESTIONS}
                  </p>

                  <div className="coach-question">
                    <strong>Understanding Check:</strong>
                    <p>{currentQuestion}</p>
                  </div>

                  <textarea
                    rows={4}
                    placeholder="Explain your understanding..."
                    value={studentAnswer}
                    onChange={(e) => {
                      setStudentAnswer(e.target.value);
                      setEvaluation(null);
                    }}
                    disabled={isEvaluating}
                  />

                  <button
                    onClick={checkUnderstanding}
                    disabled={
                      isEvaluating ||
                      !studentAnswer.trim() ||
                      evaluation !== null
                    }
                  >
                    {isEvaluating
                      ? "Evaluating..."
                      : "Check Understanding"}
                  </button>

                  <button
                    className="skip-button"
                    onClick={skipTutoring}
                    disabled={isEvaluating}
                  >
                    Skip and Continue Coding
                  </button>

                  {evaluation && (
                    <div
                      className={`coach-hint ${evaluation.understanding}`}
                    >
                      <strong>
                        Understanding: {evaluation.understanding}
                      </strong>

                      <p>{evaluation.feedback}</p>

                      {evaluation.hint && (
                        <>
                          <strong>Hint:</strong>
                          <p>{evaluation.hint}</p>
                        </>
                      )}

                      {evaluation.followUpQuestion &&
                        questionCount < MAX_QUESTIONS && (
                          <button onClick={continueTutoring}>
                            Try Another Question
                          </button>
                        )}
                    </div>
                  )}
                </>
              )}

              {tutoringStatus === "understood" && (
                <div className="tutoring-complete">
                  <h4>Understanding Demonstrated!</h4>
                  <p>
                    You can continue editing and running
                    your Python code.
                  </p>
                  {evaluation && <p>{evaluation.feedback}</p>}
                </div>
              )}

              {tutoringStatus === "skipped" && (
                <div className="tutoring-complete">
                  <h4>Tutoring Skipped</h4>
                  <p>
                    You can continue coding. Your
                    understanding has not been evaluated.
                  </p>
                </div>
              )}

              {tutoringStatus === "needs-practice" && (
                <div className="tutoring-needs-practice">
                  <h4>Let's Keep Practicing!</h4>

                  <p>
                    You've completed all {MAX_QUESTIONS} questions. You can continue coding
                    and revisit this concept later.
                  </p>

                  {evaluation && (
                    <>
                      <strong>Final Feedback:</strong>
                      <p>{evaluation.feedback}</p>

                      {evaluation.hint && (
                        <>
                          <strong>Conceptual Hint:</strong>
                          <p>{evaluation.hint}</p>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <p role="alert" style={{ color: "red" }}>
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
