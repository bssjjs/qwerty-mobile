#!/usr/bin/env node
/**
 * 从上游拉取一份最小化的源码副本到 .upstream/,供后续的
 * extract-catalog.mjs 与 prepare-data.mjs 使用。
 *
 * 两条通路,自动降级:
 *   1) git sparse-checkout —— 只拉需要的目录,最省流量
 *   2) codeload tarball   —— 直接下整包快照再解压
 *
 * 为什么需要降级:在某些网络环境下(如国内直连),`git clone` 会被重置,
 * 但 HTTPS 下载 codeload 的快照仍然可用。这里实测两种都试一遍。
 *
 * 用法: node scripts/fetch-upstream.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'

const UPSTREAM_REPO = 'RealKai42/qwerty-learner'
const UPSTREAM_BRANCH = 'master'

const root = resolve('.upstream')
const checkoutDir = join(root, 'qwerty-learner-master')
const tarballPath = join(root, 'upstream.tar.gz')

/** 需要保留的目录 —— 其余一律不要,避免拉下整个仓库 */
const SPARSE_PATHS = ['public/dicts', 'public/sounds', 'src/resources', 'LICENSE']

function log(msg) {
  console.log(`[fetch-upstream] ${msg}`)
}

function trySparseClone() {
  if (existsSync(join(checkoutDir, 'public', 'dicts'))) {
    log('已存在 .upstream 检出,跳过')
    return true
  }
  try {
    log('尝试 git sparse-checkout …')
    rmSync(checkoutDir, { recursive: true, force: true })
    execFileSync(
      'git',
      [
        'clone',
        '--depth',
        '1',
        '--filter=blob:none',
        '--sparse',
        `https://github.com/${UPSTREAM_REPO}.git`,
        checkoutDir,
      ],
      { stdio: 'inherit' },
    )
    execFileSync('git', ['-C', checkoutDir, 'sparse-checkout', 'set', ...SPARSE_PATHS], {
      stdio: 'inherit',
    })
    log('稀疏克隆成功')
    return true
  } catch {
    log('git 克隆失败(可能是网络限制),改用 tarball 快照')
    return false
  }
}

function tryTarball() {
  mkdirSync(root, { recursive: true })
  const url = `https://codeload.github.com/${UPSTREAM_REPO}/tar.gz/refs/heads/${UPSTREAM_BRANCH}`

  log(`下载快照 ${url}`)
  execFileSync(
    'curl',
    ['-sL', '--retry', '3', '--retry-delay', '5', '-m', '1800', '-o', tarballPath, url],
    { stdio: 'inherit' },
  )

  log('解压 …')
  execFileSync('tar', ['-xzf', tarballPath, '-C', root], { stdio: 'inherit' })

  if (!existsSync(join(checkoutDir, 'public', 'dicts'))) {
    throw new Error('解压后仍找不到 public/dicts,请检查网络或上游仓库结构是否变更')
  }
  log('快照解压成功')
  return true
}

// ---------------------------------------------------------------

mkdirSync(root, { recursive: true })

if (!trySparseClone()) {
  tryTarball()
}

if (!existsSync(join(checkoutDir, 'public', 'dicts'))) {
  console.error('失败:未能取得上游源码')
  process.exit(1)
}

log(`完成,上游源码位于 ${checkoutDir}`)
log('下一步:')
log(`  node scripts/extract-catalog.mjs .upstream/qwerty-learner-master src/data/catalog.json`)
log(`  node scripts/prepare-data.mjs    .upstream/qwerty-learner-master`)
