#!/bin/bash

# Ensure the models cache directory has correct permissions
mkdir -p /app/models/cache
chown -R appuser:appuser /app/models
chmod -R 755 /app/models

# Switch to appuser and run the original command
exec gosu appuser "$@"