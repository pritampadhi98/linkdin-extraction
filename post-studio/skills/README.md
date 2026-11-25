# Bundled LinkedIn skills

These 11 skills come from the open-source [LinkedIn agent skill pack](https://github.com/Jakeschincariol/linkedin-agent-skill) by Jake Schincariol, MIT licence (see `LICENSE` in this folder). Copied unchanged from upstream commit `add2c23`.

Post Studio uses them as Claude's writing rules (`li-post`, `li-profile`, `li-plan`, `li-comment`) and runs the humanizer and detector from `li-human` (`humanize.py`, `detect.py`).

## Which copy is used

For each skill, Post Studio looks in this order:

1. `SKILLS_DIR` (if you set it in `.env.local`)
2. `~/.claude/skills/<skill>` (if you've installed the skills for Claude Code)
3. this folder (`post-studio/skills/<skill>`)

So the app works straight after `git clone`, and your own installed or edited copies still win.

To update them, copy the `skills/` folder from the upstream repo over this one and keep the `LICENSE` file.
