#!/bin/sh
set -e

# Generate APP_SECRET if not provided
if [ -z "$APP_SECRET" ]; then
  if [ -f /app/data/.secret ]; then
    # Reuse existing secret
    export APP_SECRET=$(cat /app/data/.secret)
    echo "Using existing APP_SECRET from /app/data/.secret"
  else
    # Generate new secret using Node.js crypto
    export APP_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    echo "$APP_SECRET" > /app/data/.secret
    chmod 600 /app/data/.secret
    echo "Generated new APP_SECRET and saved to /app/data/.secret"
  fi
fi

# Execute the main command
exec "$@"
