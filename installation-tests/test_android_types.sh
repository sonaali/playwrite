#!/bin/bash
source ./initialize_test.sh && initialize_test "$@"

npm_i playwright-core
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm_i playwright
npm i -D typescript@3.8
npm i -D @types/node@14
echo "import { AndroidDevice, _android, AndroidWebView, Page } from 'playwright';" > "test.ts"

echo "Running tsc"
npx --yes -p typescript@3.7.5 tsc "test.ts"
