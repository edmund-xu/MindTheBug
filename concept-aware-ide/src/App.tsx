import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
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

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(
      new URL("./python.worker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (event: MessageEvent<PythonResult>) => {
      setOutput(event.data.output);
      setIsRunning(false);
    };

    worker.onerror = () => {
      setOutput("Failed to initialize Python runtime.");
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
    workerRef.current.postMessage(code);
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
          <p>
            Run your code to explore possible programming
            misconceptions.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
