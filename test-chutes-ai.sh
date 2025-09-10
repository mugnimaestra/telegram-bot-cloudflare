#!/bin/bash

# Test script for Chutes AI API connection
# Set these environment variables before running:
# CHUTES_AI_BASE_URL, CHUTES_AI_API_KEY, CHUTES_AI_MODEL

echo "Testing connection to Chutes AI..."

curl -v -X POST \
  "${CHUTES_AI_BASE_URL}/chat/completions" \
  -H "Authorization: Bearer ${CHUTES_AI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"${CHUTES_AI_MODEL}\",
    \"messages\": [{\"role\": \"user\", \"content\": \"hello\"}]
  }" --fail