
import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";

import {
  analyzeCode,
  evaluateAnswer,
  generateInsertionQuestion,
} from "./ai/api";

import type {
  AIAnalysis,
  AIEvaluation,
} from "./ai/api";

import "./App.css";

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const starterCode = `numbers = [10, 20, 30]

for i in range(3):
    print(numbers[i + 1])
`;

const MAX_QUESTIONS = 3;
const MIN_INSERTED_LINES = 5;
const EXECUTION_TIMEOUT_MS = 10000;

// --------------------------------------------------
// Types
// --------------------------------------------------

type PythonResult = {
  success: boolean;
  output: string;
};

type TutoringStatus =
  | "active"
  | "understood"
  | "skipped"
  | "needs-practice";

type TutoringSource = "debug" | "insertion" | null;

type PendingInsertion = {
  insertedCode: string;
  fullCode: string;
};

type PasteEvent = {
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
};

// --------------------------------------------------
// App
// --------------------------------------------------

function App() {
  // Python editor
  const [code, setCode] = useState(starterCode);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  // Misconception debugging
  const [analysis, setAnalysis] =
    useState<AIAnalysis | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Code insertion detection
  const [pendingInsertion, setPendingInsertion] =
    useState<PendingInsertion | null>(null);

  const [isGeneratingQuestion, setIsGeneratingQuestion] =
    useState(false);

  // Shared tutoring
  const [tutoringSource, setTutoringSource] =
    useState<TutoringSource>(null);

  const [currentQuestion, setCurrentQuestion] =
    useState("");

  const [questionCount, setQuestionCount] = useState(0);

  const [studentAnswer, setStudentAnswer] = useState("");

  const [evaluation, setEvaluation] =
    useState<AIEvaluation | null>(null);

  const [isEvaluating, setIsEvaluating] = useState(false);

  const [tutoringStatus, setTutoringStatus] =
    useState<TutoringStatus>("active");

  // Transparency
  const [showReasoning, setShowReasoning] = useState(false);

  // Error handling
  const [error, setError] = useState("");

  // Refs
  const workerRef = useRef<Worker | null>(null);

  const timeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const executionIdRef = useRef(0);
  const requestVersionRef = useRef(0);

  const submittedCodeRef = useRef("");

  const editorRef =
    useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  const pasteListenerRef =
    useRef<{ dispose(): void } | null>(null);

  const isRunningRef = useRef(false);

  // --------------------------------------------------
  // Request and tutoring helpers
  // --------------------------------------------------

  function invalidateAIRequests() {
    requestVersionRef.current += 1;
    setIsAnalyzing(false);
    setIsGeneratingQuestion(false);
    setIsEvaluating(false);
  }

  function resetTutoring() {
    setTutoringSource(null);
    setCurrentQuestion("");
    setQuestionCount(0);
    setStudentAnswer("");
    setEvaluation(null);
    setIsEvaluating(false);
    setTutoringStatus("active");
  }

  function resetGuidance() {
    setAnalysis(null);
    setPendingInsertion(null);
    setShowReasoning(false);
    resetTutoring();
    setError("");
  }

  function clearExecutionTimeout() {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  // --------------------------------------------------
  // Python worker
  // --------------------------------------------------

  function createPythonWorker() {
    const worker = new Worker(
      new URL("./python.worker.ts", import.meta.url),
      { type: "module" }
    );

    const workerId = executionIdRef.current;

    worker.onmessage = async (
      event: MessageEvent<PythonResult>
    ) => {
      if (workerId !== executionIdRef.current) {
        return;
      }

      const result = event.data;

      clearExecutionTimeout();

      isRunningRef.current = false;
      setIsRunning(false);
      setOutput(result.output);

      const hasPythonError =
        /(?:Traceback \(most recent call last\)|SyntaxError:|IndentationError:)/.test(
          result.output
        );

      if (!result.success || !hasPythonError) {
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

        if (version !== requestVersionRef.current) {
          return;
        }

        setAnalysis(aiResult);
        setTutoringSource("debug");
        setCurrentQuestion(aiResult.question);
        setQuestionCount(1);
        setTutoringStatus("active");
      } catch (err) {
        if (version !== requestVersionRef.current) {
          return;
        }

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
      if (workerId !== executionIdRef.current) {
        return;
      }

      isRunningRef.current = false;
      setIsRunning(false);

      setOutput("Python execution failed.");
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

  // --------------------------------------------------
  // Run Python
  // --------------------------------------------------

  function runCode() {
    if (
      !workerRef.current ||
      isRunningRef.current ||
      isAnalyzing ||
      isGeneratingQuestion
    ) {
      return;
    }

    invalidateAIRequests();
    resetGuidance();

    submittedCodeRef.current = code;

    isRunningRef.current = true;
    setIsRunning(true);
    setOutput("Running Python...");

    const executionId = executionIdRef.current;

    clearExecutionTimeout();

    timeoutRef.current = setTimeout(() => {
      if (executionId !== executionIdRef.current) {
        return;
      }

      resetPythonWorker();

      isRunningRef.current = false;
      setIsRunning(false);

      setOutput(
        "Execution timed out after 10 seconds.\n" +
        "Your program may contain an infinite loop."
      );
    }, EXECUTION_TIMEOUT_MS);

    workerRef.current.postMessage(code);
  }

  function stopCode() {
    if (!isRunningRef.current) return;

    invalidateAIRequests();
    resetPythonWorker();

    isRunningRef.current = false;
    setIsRunning(false);

    setOutput(
      "Execution stopped by user.\n" +
      "You can edit and run your code again."
    );
  }

  // --------------------------------------------------
  // Code insertion detection
  // --------------------------------------------------

  function handleEditorMount(
    editor: MonacoEditor.IStandaloneCodeEditor
  ) {
    editorRef.current = editor;

    pasteListenerRef.current?.dispose();

    pasteListenerRef.current = editor.onDidPaste(
      (event: PasteEvent) => {
        const model = editor.getModel();

        if (!model) return;

        const insertedCode =
          model.getValueInRange(event.range);

        const nonemptyLines = insertedCode
          .split(/\r?\n/)
          .filter((line) => line.trim().length > 0);

        if (nonemptyLines.length < MIN_INSERTED_LINES) {
          return;
        }

        const fullCode = model.getValue();

        invalidateAIRequests();
        resetGuidance();

        setPendingInsertion({
          insertedCode,
          fullCode,
        });
      }
    );
  }

  // --------------------------------------------------
  // Accept insertion check
  // --------------------------------------------------

  async function acceptInsertionCheck() {
    if (!pendingInsertion || isGeneratingQuestion) {
      return;
    }

    invalidateAIRequests();

    const version = requestVersionRef.current;
    const insertion = pendingInsertion;

    setPendingInsertion(null);
    setIsGeneratingQuestion(true);
    setError("");

    resetTutoring();

    submittedCodeRef.current = insertion.fullCode;

    try {
      const question =
        await generateInsertionQuestion(
          insertion.insertedCode,
          insertion.fullCode
        );

      if (version !== requestVersionRef.current) {
        return;
      }

      setTutoringSource("insertion");
      setCurrentQuestion(question);
      setQuestionCount(1);
      setTutoringStatus("active");
    } catch (err) {
      if (version !== requestVersionRef.current) {
        return;
      }

      setPendingInsertion(insertion);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate understanding question"
      );
    } finally {
      if (version === requestVersionRef.current) {
        setIsGeneratingQuestion(false);
      }
    }
  }

  // --------------------------------------------------
  // Decline insertion check
  // --------------------------------------------------

  function declineInsertionCheck() {
    invalidateAIRequests();

    setPendingInsertion(null);
    resetTutoring();
    setError("");
  }

  // --------------------------------------------------
  // Evaluate student understanding
  // --------------------------------------------------

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

      if (version !== requestVersionRef.current) {
        return;
      }

      setEvaluation(result);

      if (result.understanding === "correct") {
        setTutoringStatus("understood");
      } else if (
        questionCount >= MAX_QUESTIONS ||
        !result.followUpQuestion
      ) {
        setTutoringStatus("needs-practice");
      }
    } catch (err) {
      if (version !== requestVersionRef.current) {
        return;
      }

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

  // --------------------------------------------------
  // Continue tutoring
  // --------------------------------------------------

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

  // --------------------------------------------------
  // Skip tutoring
  // --------------------------------------------------

  function skipTutoring() {
    invalidateAIRequests();

    setTutoringStatus("skipped");
    setStudentAnswer("");
    setEvaluation(null);
  }

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <div className="app">
      <header>
        <h2>Mind The Bug</h2>
      </header>

      <main>
        {/* ---------------------------------------
            Single Python editor
        --------------------------------------- */}

        <section className="editor-panel">
          <h3>main.py</h3>

          <Editor
            height="450px"
            language="python"
            theme="vs-dark"
            value={code}
            onMount={handleEditorMount}
            onChange={(value) =>
              setCode(value ?? "")
            }
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              automaticLayout: true,
            }}
          />

          <div className="execution-controls">
            <button
              onClick={runCode}
              disabled={
                isRunning ||
                isAnalyzing ||
                isGeneratingQuestion
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

        {/* ---------------------------------------
            AI Concept Coach
        --------------------------------------- */}

        <section className="ai-panel">
          <h3>AI Concept Coach</h3>

          {/* Idle state */}

          {!analysis &&
            !pendingInsertion &&
            !isAnalyzing &&
            !isGeneratingQuestion &&
            !tutoringSource && (
              <p>
                Run Python code to receive debugging
                guidance, or paste a substantial block
                of code to receive an optional
                understanding check.
              </p>
            )}

          {/* -----------------------------------
              Misconception debugging
          ----------------------------------- */}

          {isAnalyzing && (
            <p>Analyzing your Python error...</p>
          )}

          {analysis && (
            <div className="coach-content">
              <h4>{analysis.title}</h4>

              <p>{analysis.explanation}</p>

              {"confidence" in analysis &&
                typeof analysis.confidence ===
                  "string" && (
                  <p>
                    <strong>AI Confidence:</strong>{" "}
                    {analysis.confidence}
                  </p>
                )}

              {"reasoning" in analysis &&
                typeof analysis.reasoning ===
                  "string" && (
                  <details>
                    <summary>
                      Why was this suggested?
                    </summary>

                    <p>{analysis.reasoning}</p>

                    <p>
                      This is a possible misconception,
                      not proof that you misunderstand
                      the concept.
                    </p>
                  </details>
                )}
            </div>
          )}

          {/* -----------------------------------
              Optional insertion check
          ----------------------------------- */}

          {pendingInsertion && (
            <div className="insertion-offer">
              <h4>Understanding Check Available</h4>

              <p>
                It looks like you inserted a substantial
                block of code. Would you like to check
                your understanding of how it works?
              </p>

              <details>
                <summary>
                  Why am I seeing this?
                </summary>

                <p>
                  The editor detected at least{" "}
                  {MIN_INSERTED_LINES} nonempty lines
                  pasted at once.
                </p>

                <p>
                  This does not necessarily mean the
                  code was generated by AI or that
                  you don't understand it.
                </p>
              </details>

              <div className="insertion-actions">
                <button
                  onClick={acceptInsertionCheck}
                  disabled={isGeneratingQuestion}
                >
                  Check Understanding
                </button>

                <button
                  className="skip-button"
                  onClick={declineInsertionCheck}
                >
                  No Thanks
                </button>
              </div>
            </div>
          )}

          {isGeneratingQuestion && (
            <p>
              Generating an understanding question
              about your inserted code...
            </p>
          )}

          {/* -----------------------------------
              Shared adaptive tutoring
          ----------------------------------- */}

          {tutoringSource && (
            <div className="coach-content">

              {tutoringStatus === "active" && (
                <>
                  <p className="question-progress">
                    Question {questionCount} of{" "}
                    {MAX_QUESTIONS}
                  </p>

                  <div className="coach-question">
                    <strong>
                      Understanding Check:
                    </strong>

                    <p>{currentQuestion}</p>
                  </div>

                  <textarea
                    rows={4}
                    placeholder="Explain your understanding..."
                    value={studentAnswer}
                    onChange={(e) =>
                      setStudentAnswer(e.target.value)
                    }
                    disabled={
                      isEvaluating ||
                      evaluation !== null
                    }
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
                  >
                    Skip and Continue Coding
                  </button>

                  {evaluation && (
                    <div
                      className={`coach-hint ${evaluation.understanding}`}
                    >
                      <strong>
                        Understanding:{" "}
                        {evaluation.understanding}
                      </strong>

                      <p>{evaluation.feedback}</p>

                      {evaluation.hint && (
                        <>
                          <strong>Hint:</strong>
                          <p>{evaluation.hint}</p>
                        </>
                      )}

                      {evaluation.followUpQuestion &&
                        questionCount <
                          MAX_QUESTIONS && (
                          <button
                            onClick={continueTutoring}
                          >
                            Try Another Question
                          </button>
                        )}
                    </div>
                  )}
                </>
              )}

              {/* Correct understanding */}

              {tutoringStatus === "understood" && (
                <div className="tutoring-complete">
                  <h4>
                    Understanding Demonstrated!
                  </h4>

                  <p>
                    You've demonstrated understanding
                    of this concept.
                  </p>

                  {evaluation && (
                    <p>{evaluation.feedback}</p>
                  )}

                  <p>
                    You can continue editing and
                    running your Python code.
                  </p>
                </div>
              )}

              {/* Student skipped */}

              {tutoringStatus === "skipped" && (
                <div className="tutoring-complete">
                  <h4>Tutoring Skipped</h4>

                  <p>
                    You can continue coding.
                    Your understanding has not
                    been evaluated.
                  </p>
                </div>
              )}

              {/* Maximum questions reached */}

              {tutoringStatus ===
                "needs-practice" && (
                <div className="tutoring-needs-practice">
                  <h4>Let's Keep Practicing!</h4>

                  <p>
                    You've reached the end of this
                    understanding check.
                    You can continue coding and
                    revisit this concept later.
                  </p>

                  {evaluation && (
                    <>
                      <strong>Final Feedback:</strong>
                      <p>{evaluation.feedback}</p>

                      {evaluation.hint && (
                        <>
                          <strong>
                            Conceptual Hint:
                          </strong>
                          <p>{evaluation.hint}</p>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error messages */}

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
