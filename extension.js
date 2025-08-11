const vscode = require("vscode");
const Groq = require("groq-sdk");

const client = new Groq({
  apiKey: "", // Replace with your actual API key
});

const IDLE_DELAY = 3000; // 3 seconds idle delay

let timer;

// Debounce function to delay API call until typing stops for delay ms
const debounce = (func, delay) => {
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
};

async function getCodeCompletion(codeContext) {
  try {
    console.log("🔹 Fetching completion from Groq for:", codeContext);

    // Detect language dynamically
    const languageId =
      vscode.window.activeTextEditor?.document.languageId || "plaintext";
    const languageMap = {
      javascript: "JavaScript",
      python: "Python",
      java: "Java",
      c: "C",
      cpp: "C++",
      cs: "C#",
      go: "Go",
      rust: "Rust",
      php: "PHP",
      ruby: "Ruby",
      swift: "Swift",
      ts: "TypeScript",
      kotlin: "Kotlin",
    };

    const languageName = languageMap[languageId] || "plaintext";

    const response = await client.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Continue this ${languageName} code:\n\n${codeContext}`,
        },
      ],
      model: "llama-3.3-70b-versatile",
    });

    if (!response || !response.choices || response.choices.length === 0) {
      console.log("❌ No response from Groq");
      return null;
    }

    let generatedText = response.choices[0].message.content.trim();

    // Determine comment style based on language
    const commentPrefix = languageId === "python" ? "# " : "// ";

    let formattedText = "";
    let insideCodeBlock = false;

    // Get current indentation from the line before the cursor
    const currentLineText = vscode.window.activeTextEditor.document.lineAt(
      vscode.window.activeTextEditor.selection.active.line
    ).text;
    const cursorIndent = currentLineText.match(/^\s*/)[0];

    const lines = generatedText.split("\n");
    lines.forEach((line) => {
      let trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        formattedText += "\n";
        return;
      }

      // Skip pure comment lines
      if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
        return;
      }

      // Remove inline comments
      let noComment = line.replace(/(\/\/.*$|#.*$)/, "").trim();

      if (noComment) {
        // If the AI didn't indent, apply the cursor's indentation
        if (!line.match(/^\s+/)) {
          noComment = cursorIndent + noComment;
        } else {
          noComment = line; // Keep AI’s own indentation
        }
        formattedText += noComment + "\n";
      }
    });

    return formattedText.trim();
  } catch (error) {
    console.error("❌ Error fetching completion from Groq:", error);
    return null;
  }
}

// Handle API call after user stops typing for IDLE_DELAY milliseconds
async function debouncedCodeCompletion(document, position) {
  return new Promise((resolve) => {
    debounce(async () => {
      // Check if entire document has non-empty content
      const fullText = document.getText();
      if (!fullText.trim()) {
        // If empty file, do not call LLM
        lastSuggestion = null;
        return resolve([]);
      }

      // Get code above cursor
      const textBeforeCursor = document.getText(
        new vscode.Range(new vscode.Position(0, 0), position)
      );

      // Get code below cursor
      const lastLine = document.lineCount - 1;
      const lastChar = document.lineAt(lastLine).range.end.character;
      const textAfterCursor = document.getText(
        new vscode.Range(position, new vscode.Position(lastLine, lastChar))
      );

      // Early exit if both before and after cursor are empty
      if (!textBeforeCursor.trim() && !textAfterCursor.trim()) {
        lastSuggestion = null;
        return resolve([]);
      }

      // Compose prompt code context
      const dots = "```";
      const codeContext = `
### FILE TYPE AND CONTENT:
File name: ${document.fileName}

### User Cursor Context
Code above cursor:
\`\`\`
${textBeforeCursor}
\`\`\`

Code below cursor:
\`\`\`
${textAfterCursor}
\`\`\`

### INSTRUCTIONS
Infer the framework and environment from the imports, syntax, and conventions in the code automatically.
Generate missing code accordingly:

### ROLE:
You are an expert-level ${document.languageId} developer.

### CONTEXT:
The user is editing a code file in ${document.languageId}.

1. Code that appears **before** the cursor (do NOT repeat):
\`\`\`
${textBeforeCursor}
\`\`\`

2. Code that appears **after** the cursor (do NOT repeat):
\`\`\`
${textAfterCursor}
\`\`\`

### INSTRUCTIONS:
- **Your job**: Write ONLY the missing code that belongs *exactly* between the above two parts.
- It must logically connect the preceding and following code so that the result is correct, consistent with style, and functional.
- Follow the same indentation, formatting, and naming conventions as in the given context.
- Assume all variables, imports, functions, and classes already declared above are available.
- If either the “before” or “after” context gives strong hints about what’s needed (data passed, return types, async flows, etc.), follow them strictly.
- If there is nothing to add, return an empty output.

### OUTPUT RULES:
1. **Only output valid ${document.languageId} code**.
2. **Do NOT output explanations, comments, or any code already in the context**.
3. **Avoid placeholders** — provide the actual intended code.
4. Keep the snippet minimal but complete enough so the code runs without breaking.
### OUTPUT RULES:
1. Only output valid ${document.languageId} code as it should appear in the file—no code block markers, no markdown, no explanations.
2. Do NOT output any lines starting with \`\`\` (triple backticks).
3. Output only the minimal, required code, directly for insertion at the cursor.
4. No extra formatting, comments, or non-code artifacts.


Now, generate the missing code:
`;

      console.log("🔹 Sending context to Groq with upper & lower code");

      const completionText = await getCodeCompletion(codeContext);
      if (!completionText) return resolve([]);

      resolve([new vscode.InlineCompletionItem(completionText)]);
    }, IDLE_DELAY)();
  });
}

// Provide inline completion items
async function provideInlineCompletion(document, position) {
  return await debouncedCodeCompletion(document, position);
}

// Activate extension
function activate(context) {
  console.log("✅ Auto-code completion extension is active!");

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { scheme: "file", language: "*" },
      { provideInlineCompletionItems: provideInlineCompletion }
    )
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
