#!/usr/bin/env bash
###############################################################################
# CPRPMC Linux/WSL setup
#
# Run from the repository root:
#   bash setup.sh
#
# This installs the Linux system tools required by run.sh, installs pyenv when
# needed, and installs the Python packages listed in requirements.txt.
###############################################################################

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info() {
    echo "[SETUP] $*"
}

fail() {
    echo "[ERROR] $*" >&2
    exit 1
}

if [ "$(uname -s)" != "Linux" ]; then
    fail "This setup script must run in Linux. On Windows, use WSL: wsl bash setup.sh"
fi

if ! command -v apt-get >/dev/null 2>&1; then
    fail "This setup script currently supports Debian/Ubuntu systems with apt-get."
fi

if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
else
    command -v sudo >/dev/null 2>&1 || fail "sudo is required to install system packages."
    SUDO="sudo"
fi

APT_PACKAGES=(
    git
    curl
    jq
    unzip
    sqlite3
    python3
    python3-pip
    python3-venv
    build-essential
    make
    libssl-dev
    zlib1g-dev
    libbz2-dev
    libreadline-dev
    libsqlite3-dev
    llvm
    libncursesw5-dev
    xz-utils
    tk-dev
    libxml2-dev
    libxmlsec1-dev
    libffi-dev
    liblzma-dev
)

info "Installing Linux system dependencies..."
$SUDO apt-get update
DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y "${APT_PACKAGES[@]}"

export PYENV_ROOT="${PYENV_ROOT:-$HOME/.pyenv}"
export PATH="$PYENV_ROOT/bin:$PYENV_ROOT/shims:$HOME/.local/bin:$PATH"

if ! command -v pyenv >/dev/null 2>&1; then
    info "Installing pyenv..."
    curl https://pyenv.run | bash
else
    info "pyenv already installed."
fi

export PATH="$PYENV_ROOT/bin:$PYENV_ROOT/shims:$HOME/.local/bin:$PATH"
if command -v pyenv >/dev/null 2>&1; then
    eval "$(pyenv init - bash)"
fi

if ! grep -q 'CPRPMC setup' "$HOME/.bashrc" 2>/dev/null; then
    info "Adding pyenv and user Python paths to ~/.bashrc..."
    {
        echo ""
        echo "# CPRPMC setup"
        echo 'export PYENV_ROOT="$HOME/.pyenv"'
        echo '[[ -d "$PYENV_ROOT/bin" ]] && export PATH="$PYENV_ROOT/bin:$PATH"'
        echo 'export PATH="$HOME/.local/bin:$PYENV_ROOT/shims:$PATH"'
        echo 'command -v pyenv >/dev/null 2>&1 && eval "$(pyenv init - bash)"'
    } >> "$HOME/.bashrc"
fi

PIP_FLAGS=(--user)
if python3 -m pip install --help 2>/dev/null | grep -q -- '--break-system-packages'; then
    PIP_FLAGS+=(--break-system-packages)
fi

info "Installing Python dependencies from requirements.txt..."
python3 -m pip install "${PIP_FLAGS[@]}" --upgrade pip
python3 -m pip install "${PIP_FLAGS[@]}" -r "$PROJECT_ROOT/requirements.txt"

info "Verifying required commands..."
for command_name in python3 sqlite3 jq unzip git pyenv jupyter; do
    command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is still not available on PATH."
done

info "Setup complete. You can now run: bash run.sh"
