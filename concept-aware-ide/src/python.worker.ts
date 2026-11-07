import { loadPyodide } from "pyodide";

// Initialize Python runtime
const pyodidePromise = loadPyodide({
  indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.3/full/",
});

// Listen for Python code from React
self.onmessage = async (event: MessageEvent<string>) => {
  try {
    // Wait until Python is ready
    const pyodide = await pyodidePromise;

    // Send student's code into Python
    pyodide.globals.set("student_code", event.data);

    // Execute Python and capture output
    const result = await pyodide.runPythonAsync(`
import io
import contextlib
import traceback

output = io.StringIO()

with contextlib.redirect_stdout(output):
    with contextlib.redirect_stderr(output):
        try:
            exec(student_code, {"__name__": "__main__"})
        except BaseException:
            traceback.print_exc()

output.getvalue()
`);

    // Send output back to React
    self.postMessage({
      success: true,
      output: String(result),
    });

  } catch (error) {
    // Handle execution or initialization errors
    self.postMessage({
      success: false,
      output: String(error),
    });
  }
};
