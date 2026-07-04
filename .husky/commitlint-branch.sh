#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "Verifying Conventional Commits in branch commits..."

npx --no-install commitlint --from="$1" --to="$2" --verbose