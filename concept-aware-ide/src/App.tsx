import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  analyzeCode,
  evaluateAnswer,
  generateCode,
  requestHint,
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
const EXECUTION_TIMEOUT_MS = 10000;

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
  // Python editor
  const [code, setCode] = useState(starterCode);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  // Interaction mode
  const [mode, setMode] = useState<Mode>("debug");

  // Misconception analysis
  const [analysis, setAnalysis] =
    useState<AIAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // AI code generation
  const [generationRequest, setGenerationRequest] =
    useState("");
  const [generatedCode, setGeneratedCode] =
    useState<GeneratedCode | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Adaptive tutoring
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [studentAnswer, setStudentAnswer] = useState("");
  const [evaluation, setEvaluation] =
    useState<AIEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [tutoringStatus, setTutoringStatus] =
    useState<TutoringStatus>("active");

  // Transparency and student control
  const [showReasoning, setShowReasoning] = useState(false);
  const [hint, setHint] = useState("");
  const [isLoadingHint, setIsLoadingHint] = useState(false);
  const [guidanceDismissed, setGuidanceDismissed] =
    useState(false);

  const [error, setError] = useState("");

  // Worker and request management
  const workerRef = useRef<Worker | null>(null);
  const timeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const executionIdRef = useRef(0);
  const requestVersionRef = useRef(0);
  const hintRequestRef = useRef(0);

  const submittedCodeRef = useRef("");
  const modeRef = useRef<Mode>("debug");

  modeRef.current = mode;

  function clearExecutionTimeout() {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function resetTutoring() {
    hintRequestRef.current += 1;

    setCurrentQuestion("");
    setQuestionCount(0);
    setStudentAnswer("");
    setEvaluation(null);
    setIsEvaluating(false);
    setTutoringStatus("active");

    setShowReasoning(false);
    setHint("");
    setIsLoadingHint(false);
    setGuidanceDismissed(false);
  }

  function createPythonWorker() {
    const worker = new Worker(
      new URL("./python.worker.ts", import.meta.url),
      { type: "module" }
    );

    const workerExecutionId = executionIdRef.current;

    worker.onmessage = async (
      event: MessageEvent<PythonResult>
    ) => {
      if (workerExecutionId !== executionIdRef.current) {
        return;
      }

      const result = event.data;

      clearExecutionTimeout();
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
      if (workerExecutionId !== executionIdRef.current) {
        return;
      }

      clearExecutionTimeout();

      setOutput("Python execution failed.");
      setIsRunning(false);
      setError("Python worker encountered an error.");

      resetPythonWorker();
    };

    workerRef.current = worker;
  }

  function resetPythonWorker() {
    clearExecutionTimeout();

    workerRef.current?.terminate();
    workerRef.current = null;

    executionIdRef.current += 1;
    createPythonWorker();
  }

  useEffect(() => {
    createPythonWorker();

    return () => {
      clearExecutionTimeout();
      workerRef.current?.terminate();
      workerRef.current = null;
      executionIdRef.current += 1;
    };
  }, []);

  function changeMode(nextMode: Mode) {
    requestVersionRef.current += 1;

    setMode(nextMode);
    setAnalysis(null);
    setGeneratedCode(null);
    setIsAnalyzing(false);
    setIsGenerating(false);
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

    const currentExecutionId = executionIdRef.current;

    clearExecutionTimeout();

    timeoutRef.current = setTimeout(() => {
      if (currentExecutionId !== executionIdRef.current) {
        return;
      }

      resetPythonWorker();

      setIsRunning(false);
      setOutput(
        "Execution timed out after 10 seconds.\n" +
          "Check your code for infinite loops or slow operations."
      );
    }, EXECUTION_TIMEOUT_MS);

    workerRef.current.postMessage(code);
  }

  function stopCode() {
    if (!isRunning) return;

    resetPythonWorker();

    setIsRunning(false);
    setOutput(
      "Execution stopped by user.\n" +
        "You can edit your code and run it again."
    );
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
      evaluation ||
      guidanceDismissed
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

    hintRequestRef.current += 1;
    setHint("");
    setIsLoadingHint(false);

    setCurrentQuestion(evaluation.followUpQuestion);
    setQuestionCount((count) => count + 1);
    setStudentAnswer("");
    setEvaluation(null);
    setTutoringStatus("active");
  }

  function skipTutoring() {
    requestVersionRef.current += 1;
    hintRequestRef.current += 1;

    setTutoringStatus("skipped");
    setStudentAnswer("");
    setEvaluation(null);
    setIsEvaluating(false);
    setIsLoadingHint(false);
  }

  async function handleRequestHint() {
    if (
      !currentQuestion ||
      isLoadingHint ||
      hint ||
      guidanceDismissed
    ) {
      return;
    }

    const requestId = ++hintRequestRef.current;
    const version = requestVersionRef.current;

    setIsLoadingHint(true);
    setError("");

    try {
      const generatedHint = await requestHint(
        submittedCodeRef.current,
        currentQuestion
      );

      if (
        requestId !== hintRequestRef.current ||
        version !== requestVersionRef.current
      ) {
        return;
      }

      setHint(generatedHint);
    } catch (err) {
      if (
        requestId !== hintRequestRef.current ||
        version !== requestVersionRef.current
      ) {
        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate hint"
      );
    } finally {
      if (requestId === hintRequestRef.current) {
        setIsLoadingHint(false);
      }
    }
  }

  function dismissGuidance() {
    hintRequestRef.current += 1;
    requestVersionRef.current += 1;

    setGuidanceDismissed(true);
    setIsLoadingHint(false);
    setIsEvaluating(false);
    setError("");
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
        {/* Interaction mode selection */}
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

        {/* Python editor */}
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

          <div className="execution-controls">
            <button
              onClick={runCode}
              disabled={
                isRunning || isAnalyzing || isGenerating
              }
            >
              {isRunning ? "Running..." : "Run Code"}
            </button>

            <button
              className="stop-button"
              onClick={stopCode}
              disabled={!isRunning}
            >
              Stop Code
            </button>
          </div>

          <h3>Output</h3>
          <pre>{output}</pre>
        </section>

        {/* AI Concept Coach */}
        <section className="ai-panel">
          <h3>AI Concept Coach</h3>

          {/* Flow 1: Misconception debugging */}
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

              {analysis && !guidanceDismissed && (
                <div className="coach-content">
                  <div className="analysis-heading">
                    <h4>{analysis.title}</h4>

                    <span
                      className={`confidence-badge ${analysis.confidence}`}
                    >
                      {analysis.confidence} confidence
                    </span>
                  </div>

                  <p>{analysis.explanation}</p>

                  <button
                    className="secondary-button"
                    onClick={() =>
                      setShowReasoning(!showReasoning)
                    }
                  >
                    {showReasoning
                      ? "Hide AI Explanation"
                      : "Why does the AI think this?"}
                  </button>

                  {showReasoning && (
                    <div className="reasoning-panel">
                      <strong>
                        Evidence from your code:
                      </strong>
                      <p>{analysis.reasoning}</p>

                      {analysis.alternativeExplanation && (
                        <>
                          <strong>
                            Another possible explanation:
                          </strong>
                          <p>
                            {analysis.alternativeExplanation}
                          </p>
                        </>
                      )}

                      <p className="uncertainty-note">
                        This is an AI-generated hypothesis,
                        not proof that you misunderstand
                        the concept.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Flow 2: AI code assistance */}
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

              {generatedCode && !guidanceDismissed && (
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

          {/* Shared tutoring */}
          {hasTutoringQuestion && !guidanceDismissed && (
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

                  <div className="tutoring-actions">
                    <button
                      className="secondary-button"
                      onClick={handleRequestHint}
                      disabled={isLoadingHint || !!hint}
                    >
                      {isLoadingHint
                        ? "Generating Hint..."
                        : hint
                          ? "Hint Provided"
                          : "Give Me a Hint"}
                    </button>

                    <button
                      className="secondary-button"
                      onClick={dismissGuidance}
                    >
                      Dismiss Guidance
                    </button>
                  </div>

                  {hint && (
                    <div className="hint-panel">
                      <strong>Conceptual Hint:</strong>
                      <p>{hint}</p>
                    </div>
                  )}

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

                  {evaluation && (
                    <p>{evaluation.feedback}</p>
                  )}
                </div>
              )}

              {tutoringStatus === "skipped" && (
                <div className="tutoring-complete">
                  <h4>Tutoring Skipped</h4>
                  <p>
                    Your understanding has not been
                    evaluated. You can continue coding.
                  </p>
                </div>
              )}

              {tutoringStatus === "needs-practice" && (
                <div className="tutoring-needs-practice">
                  <h4>Let's Keep Practicing!</h4>

                  <p>
                    You've completed all {MAX_QUESTIONS}
                    questions. You can continue coding
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

          {/* Dismissed guidance */}
          {guidanceDismissed && (
            <div className="guidance-dismissed">
              <p>
                AI guidance dismissed. Your Python code
                has not been changed.
              </p>

              <button
                className="secondary-button"
                onClick={() => setGuidanceDismissed(false)}
              >
                Restore Guidance
              </button>
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
