import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  analyzeCode,
  evaluateAnswer,
} from "./ai/api";
import type {
  AIAnalysis,
  AIEvaluation,
} from "./ai/api";
import "./App.css";

const starterCode = `numbers = [10, 20, 30]

for i in range(3):
    print(numbers[i + 1])
`;

type PythonResult = {
  success: boolean;
  output: string;
};

function App() {
  const [code, setCode] = useState(starterCode);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [studentAnswer, setStudentAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<AIEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const [error, setError] = useState("");

  const workerRef = useRef<Worker | null>(null);
  const submittedCodeRef = useRef("");

  useEffect(() => {
    const worker = new Worker(
      new URL("./python.worker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = async (event: MessageEvent<PythonResult>) => {
      const result = event.data;

      setOutput(result.output);
      setIsRunning(false);

      // Python errors are captured in the output string.
      // The worker's success flag only indicates whether
      // the runtime itself completed successfully.
      const hasPythonError =
        /(?:Traceback \(most recent call last\)|SyntaxError:|IndentationError:)/.test(
          result.output
        );

      if (!result.success || !hasPythonError) {
        return;
      }

      setIsAnalyzing(true);

      try {
        const aiResult = await analyzeCode(
          submittedCodeRef.current,
          result.output
        );

        setAnalysis(aiResult);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "AI analysis failed"
        );
      } finally {
        setIsAnalyzing(false);
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

  function runCode() {
    if (!workerRef.current || isRunning || isAnalyzing) return;

    submittedCodeRef.current = code;

    setIsRunning(true);
    setOutput("Running Python...");
    setAnalysis(null);
    setEvaluation(null);
    setStudentAnswer("");
    setError("");

    workerRef.current.postMessage(code);
  }

  async function checkUnderstanding() {
    if (!analysis || !studentAnswer.trim() || isEvaluating) return;

    setIsEvaluating(true);
    setError("");

    try {
      const result = await evaluateAnswer(
        submittedCodeRef.current,
        analysis.question,
        studentAnswer
      );

      setEvaluation(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Evaluation failed"
      );
    } finally {
      setIsEvaluating(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h2>Concept-Aware Programming Support</h2>
      </header>

      <main>
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
            disabled={isRunning || isAnalyzing}
          >
            {isRunning ? "Running..." : "Run Code"}
          </button>

          <h3>Output</h3>
          <pre>{output}</pre>
        </section>

        <section className="ai-panel">
          <h3>AI Concept Coach</h3>

          {isAnalyzing && <p>Analyzing your code...</p>}

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
                  isEvaluating || !studentAnswer.trim()
                }
              >
                {isEvaluating
                  ? "Evaluating..."
                  : "Check Understanding"}
              </button>

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
