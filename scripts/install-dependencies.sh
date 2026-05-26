#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() {
  printf '\n==> %s\n' "$*"
}

warn() {
  printf '\nWARN: %s\n' "$*" >&2
}

run_as_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  warn "Root privileges are required to install system packages, and sudo was not found."
  return 1
}

install_system_dependencies() {
  if command -v apt-get >/dev/null 2>&1; then
    log "Installing system packages with apt"
    run_as_root apt-get update
    run_as_root apt-get install -y --no-install-recommends \
      ffmpeg \
      poppler-utils \
      libreoffice \
      fonts-dejavu \
      fontconfig
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    log "Installing system packages with dnf"
    run_as_root dnf install -y \
      ffmpeg \
      poppler-utils \
      libreoffice \
      dejavu-sans-fonts \
      fontconfig
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    log "Installing system packages with yum"
    run_as_root yum install -y \
      ffmpeg \
      poppler-utils \
      libreoffice \
      dejavu-sans-fonts \
      fontconfig
    return
  fi

  if command -v pacman >/dev/null 2>&1; then
    log "Installing system packages with pacman"
    run_as_root pacman -Sy --needed --noconfirm \
      ffmpeg \
      poppler \
      libreoffice-fresh \
      ttf-dejavu \
      fontconfig
    return
  fi

  if command -v brew >/dev/null 2>&1; then
    log "Installing system packages with Homebrew"
    brew install ffmpeg poppler libreoffice fontconfig
    return
  fi

  warn "No supported package manager found. Install these manually: ffmpeg, poppler-utils/pdftoppm, libreoffice/soffice, fontconfig."
}

install_node_dependencies() {
  cd "${ROOT_DIR}"

  if ! command -v pnpm >/dev/null 2>&1; then
    if command -v corepack >/dev/null 2>&1; then
      log "Enabling pnpm with corepack"
      corepack enable
      corepack prepare pnpm@10.16.1 --activate
    else
      warn "pnpm was not found and corepack is unavailable. Install pnpm, then run pnpm install."
      return 1
    fi
  fi

  log "Installing Node dependencies"
  pnpm install
}

verify_command() {
  local command_name="$1"
  local package_hint="$2"

  if command -v "${command_name}" >/dev/null 2>&1; then
    printf 'ok: %s -> %s\n' "${command_name}" "$(command -v "${command_name}")"
  else
    warn "Missing ${command_name}. Install ${package_hint}."
    return 1
  fi
}

verify_dependencies() {
  log "Verifying preview generation binaries"
  verify_command ffmpeg "ffmpeg"
  verify_command pdftoppm "poppler-utils"
  verify_command soffice "libreoffice"
}

install_system_dependencies
install_node_dependencies
verify_dependencies

log "Dependencies installed"
