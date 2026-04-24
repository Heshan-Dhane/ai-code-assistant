CodeMind — AI Code Assistant
CodeMind is a sophisticated, AI-powered code analysis tool designed to help developers review, debug, and optimize their snippets instantly. This project was developed to explore the integration of Large Language Models (LLMs) into functional web applications.

🌟 Key Features
Multi-Mode Analysis: Choose between six specialized modes:

Review: Senior-level code critique.

Debug: Identify logic errors and runtime bugs.

Explain: Step-by-step logic breakdown for learners.

Optimize: Performance and complexity analysis.

Security: Vulnerability auditing (SQLi, XSS, etc.).

Refactor: Clean-code and DRY principle improvements.

Intelligent UI:

Syntax Highlighting: Real-time code formatting using Highlight.js.

Session History: Uses localStorage to keep track of your previous analyses even after a page refresh.

Responsive Markdown: Renders AI responses with custom severity badges (⚠️ HIGH, ⚡ MED, ✅ LOW).

Auto-Detect: Automatically identifies the programming language of the pasted code.

🛠️ Technical Breakdown
Frontend: HTML5, CSS3 (Advanced Flexbox/Grid, CSS Variables, Animations).

Logic: Vanilla JavaScript (ES6+).

API Integration: Connected to the OpenRouter API to access state-of-the-art models like Llama 3 or Gemma.

Security: Includes an error classification system to handle API rate limits, authentication errors, and network issues.

📸 Interface Design
The UI features a "Cyberpunk-Lite" aesthetic with a scanline overlay, dark mode surface colors, and a "Standard Calculator" inspired workspace layout for maximum productivity.

⚙️ Setup Instructions
Clone the repository.

Open script.js and locate the CONFIG object.

Enter your OpenRouter API Key and your preferred Model ID.

Launch index.html in any modern web browser.
---------------------------------------------------------------------------------------
NOTE THAT THERE COULD BE ERRORS I MADE IN THIS PROJECT!
