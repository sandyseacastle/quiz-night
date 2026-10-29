#!/bin/bash
# Double-click to start Quiz Night Slides (macOS)
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then echo "First run: installing…"; npm install; fi
npm start
