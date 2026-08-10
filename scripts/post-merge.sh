#!/bin/bash
set -e

# Post-merge setup: install any dependencies added by merged tasks.
npm install --no-audit --no-fund
