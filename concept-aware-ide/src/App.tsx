
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

// Default Python example
const starterCode = `numbers = [10, 20, 30]

for i in range(3):
    print(numbers[i + 1])
`;

type PythonResult = {
  success: boolean;
  output: string;
};

type Mode = "debug" | "generate";

function App() {
  // Python editor state
  const [code, setCode] = useState(starterCode);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  // Interaction mode
  const [mode, setMode] = useState<Mode>("debug");

  // Misconception debugging state
  const [analysis, setAnalysis] =
    useState<AIAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // AI code generation state
  const [generationRequest, setGenerationRequest] =
    useState("");
  const [generatedCode, setGeneratedCode] =
    useState<GeneratedCode | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Understanding evaluation state
  const [studentAnswer, setStudentAnswer] = useState("");
  const [evaluation, setEvaluation] =
    useState<AIEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Error messages
  const [error, setError] = useState("");

  // Worker and request references
  const workerRef = useRef<Worker | null>(null);
  const submittedCodeRef = useRef("");
  const modeRef = useRef<Mode>(mode);
  const requestIdRef = useRef(0);

  // Keep the current mode accessible to the worker callback
  modeRef.current = mode;

  // Initialize Pyodide Web Worker
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

      // Python errors are captured as text by our worker.
      // success=true means the worker completed, not
      // necessarily that the student's Python code succeeded.
      const hasPythonError =
        /(?:Traceback \(most recent call last\)|SyntaxError:|IndentationError:)/.test(
          result.output
        );

      // Only analyze errors in debugging mode
      if (
        !result.success ||
        !hasPythonError ||
        modeRef.current !== "debug"
      ) {
        return;
      }

      const currentRequestId = ++requestIdRef.current;

      setIsAnalyzing(true);

      try {
        const aiResult = await analyzeCode(
          submittedCodeRef.current,
          result.output
        );

        // Ignore outdated AI responses
        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        if (modeRef.current === "debug") {
          setAnalysis(aiResult);
        }
      } catch (err) {
        if (currentRequestId === requestIdRef.current) {
          setError(
            err instanceof Error
              ? err.message
              : "AI analysis failed"
          );
        }
      } finally {
        if (currentRequestId === requestIdRef.current) {
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
      requestIdRef.current++;
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Switch between interaction modes
  function switchMode(newMode: Mode) {
    requestIdRef.current++;

    setMode(newMode);
    modeRef.current = newMode;

    setAnalysis(null);
    setGeneratedCode(null);
    setEvaluation(null);
    setStudentAnswer("");
    setError("");
    setIsAnalyzing(false);
  }

  // Execute Python code
  function runCode() {
    if (
      !workerRef.current ||
      isRunning ||
      isAnalyzing ||
      isGenerating
    ) {
      return;
    }

    requestIdRef.current++;
    submittedCodeRef.current = code;

    setIsRunning(true);
    setOutput("Running Python...");

    setAnalysis(null);
    setEvaluation(null);
    setStudentAnswer("");
    setError("");

    workerRef.current.postMessage(code);
  }

  // Generate Python code using AI
  async function handleGenerateCode() {
    if (!generationRequest.trim() || isGenerating) {
      return;
    }

    const currentRequestId = ++requestIdRef.current;

    setIsGenerating(true);
    setError("");
    setGeneratedCode(null);
    setEvaluation(null);
    setStudentAnswer("");

    try {
      const result = await generateCode(generationRequest);

      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      setGeneratedCode(result);
      setCode(result.code);
      submittedCodeRef.current = result.code;

      setOutput("");
      setAnalysis(null);
    } catch (err) {
      if (currentRequestId === requestIdRef.current) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to generate code"
        );
      }
    } finally {
      setIsGenerating(false);
    }
  }

  // Evaluate the student's conceptual explanation
  async function checkUnderstanding() {
    const question =
      mode === "debug"
        ? analysis?.question
        : generatedCode?.question;

    if (
      !question ||
      !studentAnswer.trim() ||
      isEvaluating
    ) {
      return;
    }

    const currentRequestId = ++requestIdRef.current;

    setIsEvaluating(true);
    setError("");

    try {
      const result = await evaluateAnswer(
        submittedCodeRef.current,
        question,
        studentAnswer
      );

      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      setEvaluation(result);
    } catch (err) {
      if (currentRequestId === requestIdRef.current) {
        setError(
          err instanceof Error
            ? err.message
            : "Evaluation failed"
        );
      }
    } finally {
      setIsEvaluating(false);
    }
  }

  return (
    <div className="app">
      {/* Header */}
      <header>
        <h2>Concept-Aware Programming Support</h2>
      </header>

      <main>
        {/* Interaction mode selector */}
        <div className="mode-selector">
          <button
            className={mode === "debug" ? "active" : ""}
            onClick={() => switchMode("debug")}
          >
            Misconception Debugging
          </button>

          <button
            className={mode === "generate" ? "active" : ""}
            onClick={() => switchMode("generate")}
          >
            AI Code Assistance
          </button>
        </div>

        {/* Python Editor */}
        <section className="editor-panel">
          <h3>main.py</h3>

          <Editor
            height="450px"
            language="python"
            theme="vs-dark"
            value={code}
            onChange={(value) => {
              setCode(value ?? "");
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              automaticLayout: true,
            }}
          />

          <button
            onClick={runCode}
            disabled={
              isRunning ||
              isAnalyzing ||
              isGenerating
            }
          >
            {isRunning ? "Running..." : "Run Code"}
          </button>

          <h3>Output</h3>
          <pre>{output}</pre>
        </section>

        {/* AI Concept Coach */}
        <section className="ai-panel">
          <h3>AI Concept Coach</h3>

          {/* MODE 1: Misconception Debugging */}
          {mode === "debug" && (
            <>
              {isAnalyzing && (
                <p>Analyzing your code...</p>
              )}

              {!analysis && !isAnalyzing && (
                <p>
                  Run code containing an error to receive
                  conceptual guidance.
                </p>
              )}

              {analysis && (
                <div className="coach-content">
                  <h4>{analysis.title}</h4>

                  <p>{analysis.explanation}</p>

                  <div className="coach-question">
                    <strong>Conceptual Question:</strong>
                    <p>{analysis.question}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* MODE 2: AI Code Assistance */}
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

                  <div className="coach-question">
                    <strong>Understanding Check:</strong>
                    <p>{generatedCode.question}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Shared understanding evaluation */}
          {((mode === "debug" && analysis) ||
            (mode === "generate" && generatedCode)) && (
            <div className="coach-content">
              <textarea
                rows={4}
                placeholder="Explain your understanding..."
                value={studentAnswer}
                onChange={(e) => {
                  setStudentAnswer(e.target.value);
                  setEvaluation(null);
                }}
              />

              <button
                onClick={checkUnderstanding}
                disabled={
                  isEvaluating ||
                  !studentAnswer.trim()
                }
              >
                {isEvaluating
                  ? "Evaluating..."
                  : "Check Understanding"}
              </button>

              {/* Color-coded evaluation feedback */}
              {evaluation && (
                <div
                  className={`coach-hint ${evaluation.understanding}`}
                >
                  <strong>
                    Understanding: {evaluation.understanding}
                  </strong>

                  <p>{evaluation.feedback}</p>

                  <strong>Hint:</strong>
                  <p>{evaluation.hint}</p>
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
