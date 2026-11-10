#!/usr/bin/env bash
# Builds openai-layer.zip: the `openai` Python package for Lambda (python3.12, x86_64).
# Run from anywhere; output is written next to this script.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf build openai-layer.zip
mkdir -p build/python

# Force Linux x86_64 wheels so compiled deps (pydantic_core, jiter) match the Lambda runtime,
# even when building on a Mac.
pip install openai \
  --target build/python \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.12 \
  --only-binary=:all: \
  --upgrade

# Lambda extracts layers to /opt; Python packages must live under python/
(cd build && zip -r9q ../openai-layer.zip python -x '*/__pycache__/*')
rm -rf build
ls -lh openai-layer.zip
