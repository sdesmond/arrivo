## 🤖 AI Skills & Agents Setup

This repository shares custom instructions, automation workflows, and skills across **Claude Code** which expects skills at `.claude/skills` and other tools which expect skills at `.agents/skills`.

To prevent duplicating files, we maintain a **single source of truth** inside the `.agents/` folder. The folder structure uses filesystem links to map these files so both AI engines can read the exact same data simultaneously:

```text
your-project-repo/
├── .agents/                 # 🟩 SINGLE SOURCE OF TRUTH (Tracked by Git)
│   ├── skills/              # Shared Custom Skills
│   └── agents/              # Shared Sub-Agents
└── .claude/                 # 🔗 SYSTEM LINKS (Ignored by Git)
    ├── skills -> ../.agents/skills
    └── agents -> ../.agents/agents
```

### 🚀 Quick Setup

Run the command matching your operating system from the repository root to automatically link your AI workspace folders:

#### 🍏 macOS & 🐧 Linux

```bash
chmod +x ai-tools-setup/setup-ai-tools.sh && ./ai-tools-setup/setup-ai-tools.sh
```

#### 🪟 Windows 11 / 10 (Open PowerShell as Administrator)

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; .\ai-tools-setup\setup-ai-tools.ps1
```
