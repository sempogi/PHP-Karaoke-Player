#!/data/data/com.termux/files/usr/bin/bash
# Automate pushing changes to GitHub from Termux
# Usage:
#  HTTPS: push.sh https https://github.com/USERNAME/REPO.git "Your Name" "you@example.com" GH_TOKEN
#    SSH: push.sh ssh   git@github.com:USERNAME/REPO.git     "Your Name" "you@example.com"
#
# Run from inside your project directory.

set -e

MODE="${1:-}"
REMOTE_URL="${2:-}"
GIT_NAME="${3:-}"
GIT_EMAIL="${4:-}"
GH_TOKEN="${5:-}"  # Only for HTTPS

# --- Helpers ---
err() { echo -e "\033[31m[ERROR]\033[0m $*" >&2; }
info() { echo -e "\033[36m[INFO]\033[0m $*"; }
ok() { echo -e "\033[32m[OK]\033[0m $*"; }

require_arg() {
  if [ -z "$1" ]; then
    err "Missing argument: $2"
    exit 1
  fi
}

# --- Validate input ---
require_arg "$MODE" "MODE (https|ssh)"
require_arg "$REMOTE_URL" "REMOTE_URL"
require_arg "$GIT_NAME" "GIT_NAME"
require_arg "$GIT_EMAIL" "GIT_EMAIL"
if [ "$MODE" = "https" ] && [ -z "$GH_TOKEN" ]; then
  err "HTTPS mode requires GH_TOKEN (GitHub Personal Access Token)"
  exit 1
fi
if [ "$MODE" != "https" ] && [ "$MODE" != "ssh" ]; then
  err "MODE must be 'https' or 'ssh'"
  exit 1
fi

# --- Ensure storage access (safe to re-run) ---
if command -v termux-setup-storage >/dev/null 2>&1; then
  info "Ensuring Termux storage access..."
  termux-setup-storage || true
fi

# --- Ensure git is installed ---
if ! command -v git >/dev/null 2>&1; then
  info "Installing git..."
  pkg update -y && pkg install -y git
fi
ok "Git is ready: $(git --version)"

# --- Configure global identity if not set ---
CURRENT_NAME="$(git config --global user.name || true)"
CURRENT_EMAIL="$(git config --global user.email || true)"
if [ -z "$CURRENT_NAME" ]; then
  info "Setting global git user.name to '$GIT_NAME'"
  git config --global user.name "$GIT_NAME"
fi
if [ -z "$CURRENT_EMAIL" ]; then
  info "Setting global git user.email to '$GIT_EMAIL'"
  git config --global user.email "$GIT_EMAIL"
fi

# --- Initialize repo if needed ---
if [ ! -d ".git" ]; then
  info "Not a git repo. Initializing..."
  git init
  # Detect default branch preference: main (newer) vs master (older)
  DEFAULT_BRANCH="main"
  # If user has core default set, respect it (Termux usually doesn't)
  git symbolic-ref HEAD >/dev/null 2>&1 || true
  # Create initial branch
  git checkout -b "$DEFAULT_BRANCH"
  ok "Initialized repository with branch '$DEFAULT_BRANCH'"
fi

# --- Determine current branch ---
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ -z "$CURRENT_BRANCH" ] || [ "$CURRENT_BRANCH" = "HEAD" ]; then
  # Detached HEAD or undefined—fallbacks
  CURRENT_BRANCH="$(git branch --show-current || echo main)"
fi
ok "Current branch: $CURRENT_BRANCH"

# --- Set or update remote origin ---
EXISTING_REMOTE="$(git remote get-url origin 2>/dev/null || true)"
if [ -z "$EXISTING_REMOTE" ]; then
  info "Adding remote 'origin' -> $REMOTE_URL"
  git remote add origin "$REMOTE_URL"
else
  if [ "$EXISTING_REMOTE" != "$REMOTE_URL" ]; then
    info "Updating remote 'origin' from $EXISTING_REMOTE -> $REMOTE_URL"
    git remote set-url origin "$REMOTE_URL"
  else
    ok "Remote 'origin' already set to $REMOTE_URL"
  fi
fi

# --- Prepare initial commit if repo is empty ---
if ! git rev-parse HEAD >/dev/null 2>&1; then
  info "Repository has no commits. Creating first commit..."
  # Avoid committing junk; create a README if nothing staged
  if [ -z "$(git ls-files)" ]; then
    echo "# $(basename "$(pwd)")" > README.md
    echo "" >> README.md
    echo "Initialized from Termux on $(date)" >> README.md
  fi
  git add .
  git commit -m "Initial commit"
fi

# --- Stage & commit changes if any ---
CHANGES="$(git status --porcelain)"
if [ -n "$CHANGES" ]; then
  info "Staging changes..."
  git add .
  info "Committing changes..."
  git commit -m "Update: $(date +'%Y-%m-%d %H:%M:%S %Z')"
else
  ok "No changes to commit."
fi

# --- Push logic ---
info "Pushing to GitHub remote 'origin' branch '$CURRENT_BRANCH'..."

if [ "$MODE" = "https" ]; then
  # Use token in URL to avoid interactive prompt; token acts as password.
  # Pattern: https://<token>@github.com/USERNAME/REPO.git
  # We must not echo the token in logs.
  TOKEN_URL="$(echo "$REMOTE_URL" | sed -E 's#https://#https://'"$GH_TOKEN"'@#')"

  # Temporarily set remote for push only (avoid storing token in config)
  git push "$TOKEN_URL" "$CURRENT_BRANCH":"$CURRENT_BRANCH" --set-upstream || {
    err "Push failed over HTTPS. Check token scopes (repo) and URL."
    exit 1
  }
else
  # SSH push
  # Ensure SSH directory exists and has proper perms (if user already has keys)
  if [ -d "$HOME/.ssh" ]; then
    chmod 700 "$HOME/.ssh" || true
    [ -f "$HOME/.ssh/id_rsa" ] && chmod 600 "$HOME/.ssh/id_rsa" || true
    [ -f "$HOME/.ssh/id_ed25519" ] && chmod 600 "$HOME/.ssh/id_ed25519" || true
  fi

  # Try pushing and set upstream if needed
  if ! git push origin "$CURRENT_BRANCH":"$CURRENT_BRANCH" --set-upstream; then
    err "SSH push failed. Make sure your SSH key is added to GitHub."
    echo "  - Generate key: ssh-keygen -t ed25519 -C \"$GIT_EMAIL\""
    echo "  - Show pubkey : cat ~/.ssh/id_ed25519.pub"
    echo "  - Add to GitHub: Settings → SSH and GPG keys"
    exit 1
  fi
fi

ok "Push complete!"
 