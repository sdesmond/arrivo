#!/bin/bash
echo "🤖 Setting up shared AI environments for macOS/Linux..."

# Ensure source folders exist
mkdir -p .agents/skills
mkdir -p .agents/agents
mkdir -p .claude

# Remove broken or stale links/folders safely
rm -rf .claude/skills .claude/agents

# Create symlinks
ln -s ../.agents/skills .claude/skills
ln -s ../.agents/agents .claude/agents

echo "Symlinks successfully mapped!"
