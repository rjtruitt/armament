# Web Testing Guide

Run `arma --web` to start the web server on `http://localhost:3584`.
Then use curl or any HTTP client to test armament without the TUI.

## Full Test Suite

```bash
# Start the server in background
arma --web &
sleep 2

# ── Channels ──────────────────────────────────────
# List channels
curl -s http://localhost:3584/api/channels | jq '. | length'
# Expected: > 0

# Send a message
curl -s -X POST http://localhost:3584/api/channels/%23general/messages \
  -H 'Content-Type: application/json' -d '{"content":"hello world"}'
# Expected: {"ok":true}

# Read messages
curl -s http://localhost:3584/api/channels/%23general/messages | jq '. | length'
# Expected: > 0

# ── Providers ─────────────────────────────────────
# List providers
curl -s http://localhost:3584/api/providers | jq '. | length'
# Expected: > 0

# Add a provider
curl -s -X PUT http://localhost:3584/api/config \
  -H 'Content-Type: application/json' \
  -d '{"providers":[{"type":"openai","name":"test-provider","models":["gpt-4"]}]}'
# Expected: {"ok":true}

# Verify it was added
curl -s http://localhost:3584/api/providers | jq '.[] | select(.name=="test-provider") | .name'
# Expected: "test-provider"

# Remove it
curl -s -X PUT http://localhost:3584/api/config \
  -H 'Content-Type: application/json' \
  -d '{"providers":[]}'
# Expected: {"ok":true}

# ── Notes ─────────────────────────────────────────
# Save notes
curl -s -X PUT http://localhost:3584/api/channels/%23general/notes \
  -H 'Content-Type: application/json' \
  -d '{"content":"[fact] This is a test note"}'
# Expected: {"ok":true}

# Read notes
curl -s http://localhost:3584/api/channels/%23general/notes | jq '.content'
# Expected: "[fact] This is a test note"

# ── Flows ─────────────────────────────────────────
# List flows
curl -s http://localhost:3584/api/flows | jq '. | length'
# Expected: > 0

# ── Server health ─────────────────────────────────
# Root should serve the React app
curl -s -o /dev/null -w "%{http_code}" http://localhost:3584
# Expected: 200

# Config endpoint
curl -s http://localhost:3584/api/config | jq 'keys'
# Expected: ["providers","defaultModel","defaultProvider","theme"]

# ── Cleanup ───────────────────────────────────────
kill %1 2>/dev/null
```

## Run everything at once

```bash
#!/bin/bash
set -e
arma --web & sleep 2
trap 'kill %1 2>/dev/null' EXIT

echo "Test 1: Channels..."
curl -sfo /dev/null http://localhost:3584/api/channels || exit 1

echo "Test 2: Send message..."
curl -sf -X POST http://localhost:3584/api/channels/%23general/messages \
  -H 'Content-Type: application/json' -d '{"content":"test"}' || exit 1

echo "Test 3: Providers..."
curl -sfo /dev/null http://localhost:3584/api/providers || exit 1

echo "Test 4: Notes..."
curl -sf -X PUT http://localhost:3584/api/channels/%23general/notes \
  -H 'Content-Type: application/json' -d '{"content":"test"}' || exit 1
curl -sf http://localhost:3584/api/channels/%23general/notes || exit 1

echo "Test 5: Flows..."
curl -sfo /dev/null http://localhost:3584/api/flows || exit 1

echo "✓ All tests passed"
```

Save as `test-web.sh` in the project root and run with `bash test-web.sh`.
