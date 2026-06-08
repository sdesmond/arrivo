## 🤖 AI Skills & Agents Setup

This repository shares custom instructions, automation workflows, and project memory across **Claude Code** and other agent tools without duplicating the underlying files.

To prevent duplicating files, we maintain a **single source of truth** inside the `.agents/` folder. The folder structure uses filesystem links to map these files so both AI engines can read the exact same data simultaneously:

```text
your-project-repo/
├── .agents/                 # 🟩 SINGLE SOURCE OF TRUTH (Tracked by Git)
│   ├── skills/              # Shared Custom Skills
│   ├── agents/              # Shared Sub-Agents
│   └── memories/            # Shared Project Memories
└── .claude/                 # 🔗 SYSTEM LINKS (Ignored by Git)
    ├── skills -> ../.agents/skills
    ├── agents -> ../.agents/agents
    └── memory -> ../.agents/memories
```

If an older local checkout still has memories under `.claude/memory`, the setup scripts migrate those files into `.agents/memories` before recreating the compatibility link.

### 🚀 Quick Setup

The main repo bootstrap also performs this step:

```bash
npm run setup:dev
```

That command installs dependencies, prepares the databases, and configures the shared AI workspace links below.

If you only want to refresh the AI workspace links without running the full app bootstrap, use the platform-specific scripts here.

Run the command matching your operating system from the repository root to automatically link your AI workspace folders:

#### 🍏 macOS & 🐧 Linux

```bash
chmod +x ai-tools-setup/setup-ai-tools.sh && ./ai-tools-setup/setup-ai-tools.sh
```

#### 🪟 Windows 11 / 10 (Open PowerShell as Administrator)

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; .\ai-tools-setup\setup-ai-tools.ps1
```
