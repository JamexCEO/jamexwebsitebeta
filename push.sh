#!/bin/bash
REMOTE=${1:-beta}
MESSAGE=${2:-Update}
git add .
git commit -m "$MESSAGE"
git push "$REMOTE" main