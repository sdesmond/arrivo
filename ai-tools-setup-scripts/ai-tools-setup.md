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

Run one of the setup scripts that automatically builds these links and configures your environment. Run the command matching your operating system from the repository root:

#### 🍏 macOS & 🐧 Linux

```bash
chmod +x setup-ai-tools.sh && ./setup-ai-tools.sh
```

#### 🪟 Windows 11 / 10

> **⚠️ Important:** Windows users **must** enable **Developer Mode** in Windows System Settings before running this command. Open **PowerShell as an Administrator** and run:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; .\setup-ai-tools.ps1
```

---

### 🛠️ Manual Configuration (Alternative)

If you prefer to set up the links manually without the scripts, use the commands below for your operating system:

#### macOS / Linux Manual Setup

```bash
mkdir -p .claude
ln -s ../.agents/skills .claude/skills
ln -s ../.agents/agents .claude/agents
```

#### Windows Manual Setup (Command Prompt as Admin)

```cmd
mkdir .claude
mklink /J "%CD%\.claude\skills" "%CD%\.agents\skills"
mklink /J "%CD%\.claude\agents" "%CD%\.agents\agents"
```
