const vscode = require("vscode");
const Groq = require("groq-sdk");

const client = new Groq({
  apiKey: "your api key from groq-- enjoy there:/", // Replace with your actual API key
});

let timer;

// Debounce function to delay API call until typing stops
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
    const languageId = vscode.window.activeTextEditor?.document.languageId || "plaintext";
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
      messages: [{ role: "user", content: `Continue this ${languageName} code:\n\n${codeContext}` }],
      model: "qwen-2.5-coder-32b",
    });

    if (!response || !response.choices || response.choices.length === 0) {
      console.log("❌ No response from Groq");
      return null;
    }

    let generatedText = response.choices[0].message.content.trim();
    // console.log("✅ AI Response:", generatedText);

    // Determine comment style based on language
    const commentPrefix = languageId === "python" ? "# " : "// ";

    let formattedText = "";
    let insideCodeBlock = false;
    let commentCount = 0;

    const isCodeLine = (line) => {
      if (insideCodeBlock) return true;

      const jsPattern = /^(const|let|var|function|class|import|export|async|await|return|if|else|switch|case|for|while|try|catch|throw|new) /;
      const pythonPattern = /^(def |class |import |from |return |if |elif |else:|try:|except |for |while |with |async |await )/;

      if (languageId === "python") return pythonPattern.test(line) || /^[a-zA-Z_]\w*\s*=/.test(line);
      if (languageId === "javascript") return jsPattern.test(line) || /^[a-zA-Z_$]\w*\s*=/.test(line);

      return false;
    };

    const lines = generatedText.split("\n");
    lines.forEach((line) => {
      if (line.startsWith("```")) {
        insideCodeBlock = !insideCodeBlock;
      } else if (line.trim() === "") {
        formattedText += "\n";
      } else if (isCodeLine(line)) {
        formattedText += line + "\n";
      } else if (commentCount < 2) { // Only allow up to 2 comments
        formattedText += commentPrefix + line + "\n";
        commentCount++;
      }
    });

    return formattedText.trim();
  } catch (error) {
    console.error("❌ Error fetching completion from Groq:", error);
    return null;
  }
}


// Handle API call after user stops typing for 500ms
async function debouncedCodeCompletion(document, position) {
  return new Promise((resolve) => {
    debounce(async () => {
      const textBeforeCursor = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
      console.log("🔹 Current Code Context:", textBeforeCursor);

      const completionText = await getCodeCompletion(textBeforeCursor);
      if (!completionText) return resolve([]);

      resolve([new vscode.InlineCompletionItem(completionText)]);
    }, 500)();
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
