#!/usr/bin/env node

/**
 * Release Script for @globetracker/service-control
 * 
 * This script handles version bumping and GitHub release creation
 * to trigger CI/CD workflows.
 * 
 * Usage:
 *   bun run scripts/release.js [version-type] [--dry-run] [--skip-tests]
 * 
 * Version types:
 *   patch, minor, major, prerelease, prepatch, preminor, premajor
 * 
 * Examples:
 *   bun run scripts/release.js patch
 *   bun run scripts/release.js minor --dry-run
 *   bun run scripts/release.js major --skip-tests
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const VERSION_TYPES = ['patch', 'minor', 'major', 'prerelease', 'prepatch', 'preminor', 'premajor']
const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_TESTS = process.argv.includes('--skip-tests')

// Parse command line arguments
const versionType = process.argv[2]
const isDryRun = DRY_RUN
const skipTests = SKIP_TESTS

if (!versionType || !VERSION_TYPES.includes(versionType)) {
  console.error('❌ Invalid or missing version type')
  console.error(`Usage: bun run scripts/release.js [${VERSION_TYPES.join('|')}] [--dry-run] [--skip-tests]`)
  process.exit(1)
}

console.log(`🚀 Starting release process for @globetracker/service-control`)
console.log(`📋 Version type: ${versionType}`)
if (isDryRun) console.log('🔍 DRY RUN MODE - No changes will be made')
if (skipTests) console.log('⏭️  Skipping tests')

// Helper functions
function exec(command, options = {}) {
  console.log(`📝 Executing: ${command}`)
  if (!isDryRun) {
    return execSync(command, { 
      stdio: 'inherit', 
      encoding: 'utf8',
      ...options 
    })
  }
  console.log('🔍 [DRY RUN] Would execute:', command)
  return ''
}

function getCurrentVersion() {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  return packageJson.version
}

function updateVersion(newVersion) {
  const packageJsonPath = 'package.json'
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  packageJson.version = newVersion
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
  console.log(`📦 Updated package.json version to ${newVersion}`)
}

function getNextVersion(currentVersion, versionType) {
  const [major, minor, patch] = currentVersion.split('.').map(Number)
  
  switch (versionType) {
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'major':
      return `${major + 1}.0.0`
    case 'prerelease':
      return `${major}.${minor}.${patch}-rc.1`
    case 'prepatch':
      return `${major}.${minor}.${patch + 1}-rc.1`
    case 'preminor':
      return `${major}.${minor + 1}.0-rc.1`
    case 'premajor':
      return `${major + 1}.0.0-rc.1`
    default:
      throw new Error(`Invalid version type: ${versionType}`)
  }
}

function checkWorkingDirectory() {
  try {
    exec('git status --porcelain', { stdio: 'pipe' })
    const status = execSync('git status --porcelain', { encoding: 'utf8' })
    if (status.trim()) {
      console.error('❌ Working directory is not clean. Please commit or stash changes first.')
      console.error('Uncommitted changes:')
      console.error(status)
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Not in a git repository or git not available')
    process.exit(1)
  }
}

function checkBranch() {
  const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim()
  if (branch !== 'main' && branch !== 'master') {
    console.error(`❌ Not on main/master branch. Current branch: ${branch}`)
    console.error('Please switch to main/master branch before releasing')
    process.exit(1)
  }
}

function checkRemote() {
  try {
    exec('git remote get-url origin', { stdio: 'pipe' })
  } catch (error) {
    console.error('❌ No remote origin found')
    process.exit(1)
  }
}

function runTests() {
  if (skipTests) {
    console.log('⏭️  Skipping tests as requested')
    return
  }
  
  console.log('🧪 Running tests...')
  try {
    // Note: Add test command when tests are implemented
    console.log('⚠️  No tests configured yet - skipping test execution')
    console.log('✅ Tests skipped (none configured)')
  } catch (error) {
    console.error('❌ Tests failed. Please fix tests before releasing.')
    process.exit(1)
  }
}

function runLinting() {
  console.log('🔍 Running linting...')
  try {
    exec('bun run lint')
    console.log('✅ Linting passed')
  } catch (error) {
    console.error('❌ Linting failed. Please fix linting issues before releasing.')
    process.exit(1)
  }
}

function runTypeCheck() {
  console.log('🔍 Running type check...')
  try {
    exec('bun run typecheck')
    console.log('✅ Type check passed')
  } catch (error) {
    console.error('❌ Type check failed. Please fix type errors before releasing.')
    process.exit(1)
  }
}

function buildProject() {
  console.log('🔨 Building project...')
  try {
    exec('bun run build')
    console.log('✅ Build successful')
  } catch (error) {
    console.error('❌ Build failed. Please fix build issues before releasing.')
    process.exit(1)
  }
}

function createReleaseCommit(newVersion) {
  const commitMessage = `chore(release): :rocket: release v${newVersion}`
  exec('git add package.json')
  exec(`git commit -m "${commitMessage}"`)
  console.log(`📝 Created release commit: ${commitMessage}`)
}

function createGitTag(newVersion) {
  const tagName = `v${newVersion}`
  exec(`git tag -a ${tagName} -m "Release ${tagName}"`)
  console.log(`🏷️  Created git tag: ${tagName}`)
}

function pushChanges() {
  console.log('📤 Pushing changes to remote...')
  exec('git push origin main')
  exec('git push origin --tags')
  console.log('✅ Changes pushed to remote')
}

function createGitHubRelease(newVersion) {
  const tagName = `v${newVersion}`
  const releaseTitle = `Release ${tagName}`
  
  // Generate release notes from CHANGELOG.md
  let releaseNotes = ''
  try {
    const changelog = readFileSync('CHANGELOG.md', 'utf8')
    const lines = changelog.split('\n')
    const versionIndex = lines.findIndex(line => line.includes(`[${tagName}]`))
    
    if (versionIndex !== -1) {
      const nextVersionIndex = lines.findIndex((line, index) => 
        index > versionIndex && line.startsWith('## [')
      )
      
      const endIndex = nextVersionIndex === -1 ? lines.length : nextVersionIndex
      releaseNotes = lines.slice(versionIndex, endIndex).join('\n').trim()
    }
  } catch (error) {
    console.warn('⚠️  Could not read CHANGELOG.md, using default release notes')
    releaseNotes = `Release ${tagName}\n\n## Changes\n\n- Service control and lifecycle management updates\n- See CHANGELOG.md for detailed changes.`
  }
  
  if (!releaseNotes) {
    releaseNotes = `Release ${tagName}\n\n## Changes\n\n- Service control and lifecycle management updates\n- See CHANGELOG.md for detailed changes.`
  }
  
  console.log('📋 Creating GitHub release...')
  const ghCommand = `gh release create ${tagName} --title "${releaseTitle}" --notes "${releaseNotes}"`
  exec(ghCommand)
  console.log('✅ GitHub release created')
}

function checkGitHubCLI() {
  try {
    exec('gh --version', { stdio: 'pipe' })
  } catch (error) {
    console.error('❌ GitHub CLI (gh) not found. Please install it to create releases.')
    console.error('Install: https://cli.github.com/')
    process.exit(1)
  }
}

// Main release process
async function main() {
  try {
    console.log('🔍 Pre-release checks...')
    checkWorkingDirectory()
    checkBranch()
    checkRemote()
    
    if (!isDryRun) {
      checkGitHubCLI()
    }
    
    console.log('🧪 Running quality checks...')
    runLinting()
    runTypeCheck()
    runTests()
    buildProject()
    
    const currentVersion = getCurrentVersion()
    const newVersion = getNextVersion(currentVersion, versionType)
    
    console.log(`📊 Version bump: ${currentVersion} → ${newVersion}`)
    
    if (isDryRun) {
      console.log('🔍 [DRY RUN] Would perform the following actions:')
      console.log(`  - Update package.json version to ${newVersion}`)
      console.log('  - Create release commit')
      console.log(`  - Create git tag v${newVersion}`)
      console.log('  - Push changes to remote')
      console.log(`  - Create GitHub release v${newVersion}`)
      console.log('✅ Dry run completed successfully')
      return
    }
    
    console.log('📦 Updating version...')
    updateVersion(newVersion)
    
    console.log('📝 Creating release commit and tag...')
    createReleaseCommit(newVersion)
    createGitTag(newVersion)
    
    console.log('📤 Pushing changes...')
    pushChanges()
    
    console.log('🚀 Creating GitHub release...')
    createGitHubRelease(newVersion)
    
    console.log('✅ Release completed successfully!')
    console.log(`🎉 Version ${newVersion} has been released`)
    console.log('🐳 CI/CD workflow should now be triggered automatically')
    
  } catch (error) {
    console.error('❌ Release failed:', error.message)
    process.exit(1)
  }
}

// Run the release process
main()
