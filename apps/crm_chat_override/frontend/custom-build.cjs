// custom-build.cjs
const fs   = require('fs-extra')
const path = require('path')

const ROOT         = __dirname
const CRM_SRC      = path.resolve(ROOT, '../../crm/frontend/src')
const CRM_FRONTEND = path.resolve(ROOT, '../../crm/frontend')
const OVERRIDE_SRC = path.resolve(ROOT, '../src_override')
const LOCAL_SRC    = path.resolve(ROOT, 'src')

// 1 — Fresh copy of CRM src
console.log('\n[1/3] Copying CRM src…')
fs.emptyDirSync(LOCAL_SRC)
fs.copySync(CRM_SRC, LOCAL_SRC)

// Copy index.css that main.js imports
const crmIndexCss = path.join(CRM_FRONTEND, 'index.css')
if (fs.existsSync(crmIndexCss)) {
  fs.copySync(crmIndexCss, path.join(ROOT, 'index.css'))
}

// 2 — Apply overrides on top
console.log('[2/3] Applying src_override…')
fs.copySync(OVERRIDE_SRC, LOCAL_SRC)

console.log('[3/3] Done — starting Vite build.\n')