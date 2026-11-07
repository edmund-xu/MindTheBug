import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { detectMisconception } from "./ai/misconceptions";
import type { Misconception } from "./ai/misconceptions";
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

  const [misconception, setMisconception] =
    useState<Misconception | null>(null);

  const [studentAnswer, setStudentAnswer] = useState("");
  const [showHint, setShowHint] = useState(false);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(
      new URL("./python.worker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (event: MessageEvent<PythonResult>) => {
      const result = event.data;

      setOutput(result.output);
      setIsRunning(false);

      if (result.success) {
        setMisconception(detectMisconception(result.output));
      } else {
        setMisconception(null);
      }
    };

    worker.onerror = () => {
      setOutput("Failed to initialize Python runtime.");
      setMisconception(null);
      setIsRunning(false);
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  function runCode() {
    if (!workerRef.current || isRunning) return;

    setIsRunning(true);
    setOutput("Running Python...");

    setMisconception(null);
    setStudentAnswer("");
    setShowHint(false);

    workerRef.current.postMessage(code);
  }

  function checkUnderstanding() {
    if (!studentAnswer.trim()) return;
    setShowHint(true);
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

          <button onClick={runCode} disabled={isRunning}>
            {isRunning ? "Running..." : "Run Code"}
          </button>

          <h3>Output</h3>
          <pre>{output}</pre>
        </section>

        <section className="ai-panel">
          <h3>AI Concept Coach</h3>

          {!misconception && (
            <p>
              Run code containing an error to explore a
              possible programming misconception.
            </p>
          )}

          {misconception && (
            <div className="coach-content">
              <h4>{misconception.title}</h4>

              <p>{misconception.explanation}</p>

              <div className="coach-question">
                <strong>Conceptual Question:</strong>
                <p>{misconception.question}</p>
              </div>

              <textarea
                placeholder="Explain your understanding..."
                value={studentAnswer}
                onChange={(e) => {
                  setStudentAnswer(e.target.value);
                  setShowHint(false);
                }}
                rows={4}
              />

              <button
                onClick={checkUnderstanding}
                disabled={!studentAnswer.trim()}
              >
                Check Understanding
              </button>

              {showHint && (
                <div className="coach-hint">
                  <strong>Conceptual Hint:</strong>
                  <p>{misconception.hint}</p>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
