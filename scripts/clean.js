// Removes previous build output so old installers/artifacts don't pile up
// in dist/ and out/ across runs. Runs automatically before `npm run dist`.
const fs = require('fs')
const path = require('path')

const targets = ['out', 'dist']

for (const dir of targets) {
  const full = path.join(__dirname, '..', dir)
  fs.rmSync(full, { recursive: true, force: true })
  console.log(`[clean] removed ${dir}/`)
}
