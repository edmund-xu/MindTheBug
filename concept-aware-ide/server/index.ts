import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

import {
    misconceptionPrompt,
    evaluationPrompt,
    codeGenerationPrompt,
    hintPrompt,
} from "./prompts";

const app = express();
const client = new OpenAI();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));

app.post("/api/analyze", async (req, res) => {
  try {
    const { code, output } = req.body;

    if (
      typeof code !== "string" ||
      typeof output !== "string"
    ) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: misconceptionPrompt },
        {
          role: "user",
          content: JSON.stringify({ code, output }),
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message.content;

    if (!content) {
      throw new Error("Empty AI response");
    }

    res.json(JSON.parse(content));
  } catch (error) {
    console.error("Analyze error:", error);
    res.status(500).json({
      error: "Failed to analyze Python code",
    });
  }
});

app.post("/api/evaluate", async (req, res) => {
  try {
    const { code, question, answer } = req.body;

    if (
      typeof code !== "string" ||
      typeof question !== "string" ||
      typeof answer !== "string"
    ) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: evaluationPrompt },
        {
          role: "user",
          content: JSON.stringify({
            code,
            question,
            studentAnswer: answer,
          }),
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message.content;

    if (!content) {
      throw new Error("Empty AI response");
    }

    res.json(JSON.parse(content));
  } catch (error) {
    console.error("Evaluation error:", error);
    res.status(500).json({
      error: "Failed to evaluate student response",
    });
  }
});


app.post("/api/generate", async (req, res) => {
    try {
      const { request } = req.body;
  
      if (
        typeof request !== "string" ||
        !request.trim() ||
        request.length > 2000
      ) {
        res.status(400).json({
          error: "Invalid code generation request",
        });
        return;
      }
  
      const response = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: codeGenerationPrompt,
          },
          {
            role: "user",
            content: request,
          },
        ],
        response_format: { type: "json_object" },
      });
  
      const content = response.choices[0]?.message.content;
  
      if (!content) {
        throw new Error("Empty AI response");
      }
  
      const generated = JSON.parse(content);
  
      if (
        typeof generated.code !== "string" ||
        typeof generated.explanation !== "string" ||
        typeof generated.question !== "string"
      ) {
        throw new Error("Invalid AI response structure");
      }
  
      res.json(generated);
    } catch (error) {
      console.error("Code generation error:", error);
  
      res.status(500).json({
        error: "Failed to generate Python code",
      });
    }
  });  


app.post("/api/hint", async (req, res) => {
    try {
      const { code, question } = req.body ?? {};
  
      if (
        typeof code !== "string" ||
        typeof question !== "string" ||
        !question.trim() ||
        code.length > 20000 ||
        question.length > 2000
      ) {
        res.status(400).json({
          error: "Invalid hint request",
        });
        return;
      }
  
      const response = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: hintPrompt,
          },
          {
            role: "user",
            content: JSON.stringify({ code, question }),
          },
        ],
        response_format: { type: "json_object" },
      });
  
      const content = response.choices[0]?.message.content;
  
      if (!content) {
        throw new Error("Empty AI response");
      }
  
      const result = JSON.parse(content);
  
      if (typeof result.hint !== "string") {
        throw new Error("Invalid hint response");
      }
  
      res.json({ hint: result.hint });
    } catch (error) {
      console.error("Hint generation error:", error);
  
      res.status(500).json({
        error: "Failed to generate hint",
      });
    }
  });  

app.listen(3001, () => {
  console.log("AI server running on http://localhost:3001");
});

