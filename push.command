#!/bin/bash
cd "$(dirname "$0")"
default_msg="Update $(date '+%b %d %H:%M')"
read -p "Commit: [$default_msg] " msg
git add .
git commit -m "${msg:-$default_msg}"
git push origin main && echo "✓ Pushed successfully."
echo "Press any key to close."
read -n 1
