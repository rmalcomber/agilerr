#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const puppeteer = require('puppeteer')

const toolRoot = __dirname
const repoRoot = path.resolve(toolRoot, '..', '..')
const backendEnvPath = path.join(repoRoot, 'backend', '.env')
const configPath = path.join(toolRoot, 'capture.config.json')
const outputDir = path.join(toolRoot, 'output')

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const source = fs.readFileSync(filePath, 'utf8')
  const result = {}
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index <= 0) continue
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function safeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-')
}

async function waitForText(page, text, timeout = 30000) {
  await page.waitForFunction(
    (expected) => document.body?.innerText?.includes(expected),
    { timeout },
    text,
  )
}

async function login(page, baseUrl, email, password) {
  await page.goto(baseUrl, { waitUntil: 'networkidle2' })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.type('input[type="email"]', email)
  await page.type('input[type="password"]', password)
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNetworkIdle({ idleTime: 500, timeout: 20000 }).catch(() => undefined),
  ])

  const signInStillVisible = await page.$('button[type="submit"]')
  if (signInStillVisible) {
    const text = await page.evaluate(() => document.body?.innerText || '')
    if (text.includes('Sign in')) {
      throw new Error('Login did not complete. Check credentials or backend availability.')
    }
  }
}

async function getFirstProjectId(page, baseUrl) {
  const authRaw = await page.evaluate(() => window.localStorage.getItem('pocketbase_auth'))
  if (!authRaw) {
    throw new Error('PocketBase auth token not found in localStorage after login.')
  }
  const auth = JSON.parse(authRaw)
  if (!auth.token) {
    throw new Error('Auth token missing from PocketBase auth store.')
  }

  const response = await page.evaluate(
    async ({ targetBaseUrl, token }) => {
      const res = await fetch(`${targetBaseUrl}/api/agilerr/projects`, {
        headers: {
          authorization: token,
        },
      })
      const text = await res.text()
      return { ok: res.ok, status: res.status, text }
    },
    { targetBaseUrl: baseUrl, token: auth.token },
  )

  if (!response.ok) {
    throw new Error(`Project discovery failed with ${response.status}: ${response.text}`)
  }

  const data = JSON.parse(response.text)
  if (!Array.isArray(data.projects) || !data.projects.length) {
    throw new Error('No projects found for screenshot capture.')
  }
  return data.projects[0].id
}

function resolvePath(template, projectId) {
  return template
    .replace('__FIRST_PROJECT_DASHBOARD__', `/projects/${projectId}`)
    .replace('__FIRST_PROJECT_KANBAN__', `/projects/${projectId}/kanban`)
    .replace('__FIRST_PROJECT_BACKLOG__', `/projects/${projectId}/backlog`)
    .replace('__FIRST_PROJECT_BUGS__', `/projects/${projectId}/bugs`)
    .replace('__FIRST_PROJECT_SETTINGS__', `/projects/${projectId}/settings`)
}

function convertToWebp(inputPath, outputPath) {
  execFileSync('convert', [inputPath, '-quality', '88', outputPath], {
    stdio: 'inherit',
  })
}

async function capturePage(page, baseUrl, item, projectId) {
  const routePath = resolvePath(item.path, projectId)
  const targetUrl = new URL(routePath, `${baseUrl}/`).toString()
  const pngPath = path.join(outputDir, `${safeFileName(item.name)}.png`)
  const webpPath = path.join(outputDir, `${safeFileName(item.name)}.webp`)

  console.log(`Capturing ${item.name} -> ${routePath}`)
  try {
    if (item.mode === 'spa') {
      await page.goto(baseUrl, { waitUntil: 'networkidle2' })
      await page.evaluate((nextPath) => {
        window.history.pushState({}, '', nextPath)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }, routePath)
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 20000 }).catch(() => undefined)
    } else {
      await page.goto(targetUrl, { waitUntil: 'networkidle2' })
    }
    if (item.waitFor?.startsWith('text=')) {
      await waitForText(page, item.waitFor.slice(5))
    } else if (item.waitFor) {
      await page.waitForSelector(item.waitFor, { timeout: 15000 })
    }
  } catch (error) {
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 1200) || '')
    throw new Error(`Capture failed for ${item.name} (${routePath}): ${error.message}\n\nPage text:\n${bodyText}`)
  }

  await page.screenshot({
    path: pngPath,
    fullPage: true,
  })
  convertToWebp(pngPath, webpPath)
  fs.unlinkSync(pngPath)
  return { routePath, webpPath }
}

async function main() {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const backendEnv = readEnvFile(backendEnvPath)
  const email = process.env.AGILERR_ADMIN_EMAIL || backendEnv.ADMIN_EMAIL || 'admin@agilerr.local'
  const password = process.env.AGILERR_ADMIN_PASSWORD || backendEnv.ADMIN_PASSWORD || 'change-me-now'
  const baseUrl = process.env.AGILERR_BASE_URL || config.baseUrl || 'http://localhost:5173'

  ensureDir(outputDir)

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: config.viewport || { width: 1600, height: 1100 },
  })

  try {
    const page = await browser.newPage()
    await login(page, baseUrl, email, password)
    const projectId = await getFirstProjectId(page, baseUrl)

    const results = []
    for (const item of config.screenshots || []) {
      const result = await capturePage(page, baseUrl, item, projectId)
      results.push({
        name: item.name,
        path: result.routePath,
        file: path.relative(repoRoot, result.webpPath),
      })
    }

    const manifestPath = path.join(outputDir, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2))

    console.log(`Captured ${results.length} screenshots.`)
    for (const result of results) {
      console.log(`${result.name}: ${result.file} (${result.path})`)
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error.stack || String(error))
  process.exit(1)
})
