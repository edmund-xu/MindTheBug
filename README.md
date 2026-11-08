# Concept-Aware IDE — Setup Guide

## 1. Prerequisites

Make sure you have the following installed:

- **Node.js** — https://nodejs.org/
- **Git** — https://git-scm.com/

You will also need an **OpenAI API key** to use the AI features: https://platform.openai.com/home

## 2. Install Dependencies

Inside the project folder, run:

```bash
npm install
```

## 4. Set Up the API Key

Create a file named `.env` in the root project folder.

Add the following line:

```env
OPENAI_API_KEY=your_api_key_here
```

Replace `your_api_key_here` with your OpenAI API key.

**Important:** Do not commit or push your `.env` file to GitHub. (The .gitignore should already ignore it so no need to remember)

## 5. Run the Project

You need **two terminals** open in the project folder.

**Terminal 1 — Start the backend:**

```bash
npx tsx server/index.ts
```

**Terminal 2 — Start the frontend:**

```bash
npm run dev
```

Open the URL displayed in Terminal 2

Keep both terminals running while using the application.

## 6. Stopping the Project

Press `Ctrl + C` in each terminal to stop the servers.