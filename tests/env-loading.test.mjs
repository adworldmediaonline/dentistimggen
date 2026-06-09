import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

function createFixtureProject() {
  const projectDir = mkdtempSync(join(tmpdir(), "next-env-"))

  writeFileSync(join(projectDir, ".env"), "ENV_TEST_SHARED=base\nENV_TEST_BASE_ONLY=base\n")
  writeFileSync(
    join(projectDir, ".env.local"),
    "ENV_TEST_SHARED=local\nENV_TEST_LOCAL_ONLY=local\n",
  )
  writeFileSync(
    join(projectDir, ".env.production"),
    "ENV_TEST_SHARED=production\nENV_TEST_PROD_ONLY=production\n",
  )
  writeFileSync(
    join(projectDir, ".env.production.local"),
    "ENV_TEST_SHARED=production-local\nENV_TEST_PROD_LOCAL_ONLY=production-local\n",
  )
  writeFileSync(join(projectDir, ".env.test"), "ENV_TEST_SHARED=test\nENV_TEST_ONLY=test\n")
  writeFileSync(
    join(projectDir, ".env.test.local"),
    "ENV_TEST_SHARED=test-local\nENV_TEST_LOCAL_ONLY=test-local\n",
  )

  return projectDir
}

function loadFixtureEnv(projectDir, { dev, nodeEnv }) {
  const script = `
    const { loadEnvConfig } = require("@next/env")
    const result = loadEnvConfig(${JSON.stringify(projectDir)}, ${JSON.stringify(dev)}, {
      info() {},
      error(error) { throw error },
    }, true)

    console.log(JSON.stringify({
      baseOnly: process.env.ENV_TEST_BASE_ONLY ?? null,
      files: result.loadedEnvFiles.map((file) => file.path),
      localOnly: process.env.ENV_TEST_LOCAL_ONLY ?? null,
      prodLocalOnly: process.env.ENV_TEST_PROD_LOCAL_ONLY ?? null,
      prodOnly: process.env.ENV_TEST_PROD_ONLY ?? null,
      shared: process.env.ENV_TEST_SHARED ?? null,
      testOnly: process.env.ENV_TEST_ONLY ?? null,
    }))
  `

  return JSON.parse(
    execFileSync(process.execPath, ["-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        NODE_ENV: nodeEnv,
        PATH: process.env.PATH,
      },
    }),
  )
}

test("Next env loader uses .env.local for development", () => {
  const projectDir = createFixtureProject()

  try {
    const env = loadFixtureEnv(projectDir, { dev: true, nodeEnv: "development" })

    assert.deepEqual(env.files, [".env.local", ".env"])
    assert.equal(env.shared, "local")
    assert.equal(env.localOnly, "local")
    assert.equal(env.baseOnly, "base")
    assert.equal(env.prodLocalOnly, null)
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test("Next env loader uses production files before .env.local for builds and start", () => {
  const projectDir = createFixtureProject()

  try {
    const env = loadFixtureEnv(projectDir, { dev: false, nodeEnv: "production" })

    assert.deepEqual(env.files, [".env.production.local", ".env.local", ".env.production", ".env"])
    assert.equal(env.shared, "production-local")
    assert.equal(env.prodLocalOnly, "production-local")
    assert.equal(env.localOnly, "local")
    assert.equal(env.prodOnly, "production")
    assert.equal(env.baseOnly, "base")
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test("Next env loader skips .env.local in test mode", () => {
  const projectDir = createFixtureProject()

  try {
    const env = loadFixtureEnv(projectDir, { dev: false, nodeEnv: "test" })

    assert.deepEqual(env.files, [".env.test.local", ".env.test", ".env"])
    assert.equal(env.shared, "test-local")
    assert.equal(env.localOnly, "test-local")
    assert.equal(env.testOnly, "test")
    assert.equal(env.baseOnly, "base")
    assert.equal(env.prodLocalOnly, null)
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
})
