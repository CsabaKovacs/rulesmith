#!/usr/bin/env bash
set -euo pipefail

deploy_preview() {
  flutter test
  flutter build apk
}

deploy_preview
