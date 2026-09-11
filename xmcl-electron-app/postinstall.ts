import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

if (!existsSync(join(__dirname, 'dist'))) {
  mkdirSync(join(__dirname, 'dist'))
}

if (!existsSync(join(__dirname, '.env'))) {
  writeFileSync(join(__dirname, '.env'), '# Local launcher overrides\n')
}

if (process.platform === 'linux' || process.platform === 'openbsd' || process.platform === 'freebsd') {
  // Overwrite the linux electron-builder js code. The install prefix is pinned
  // to the URL scheme (`minelatino`) so it matches `executableName` and the
  // desktop entry in build/electron-builder.config.ts.
  const installPrefixName = 'minelatino'
  const fpmTargetFilePath = './node_modules/app-builder-lib/out/targets/FpmTarget.js'
  const linuxTargetHelperFilePath = './node_modules/app-builder-lib/out/targets/LinuxTargetHelper.js'
  const linuxAfterInstallShPath = './node_modules/app-builder-lib/templates/linux/after-install.tpl'
  writeFileSync(fpmTargetFilePath, readFileSync(fpmTargetFilePath, 'utf-8')
    // eslint-disable-next-line no-template-curly-in-string
    .replace('installPrefix}/${appInfo.sanitizedProductName}', `installPrefix}/${installPrefixName}`), 'utf-8')
  writeFileSync(linuxTargetHelperFilePath, readFileSync(linuxTargetHelperFilePath, 'utf-8')
    // eslint-disable-next-line no-template-curly-in-string
    .replace('installPrefix}/${appInfo.sanitizedProductName}', `installPrefix}/${installPrefixName}`), 'utf-8')
  writeFileSync(linuxAfterInstallShPath, readFileSync(linuxAfterInstallShPath, 'utf-8')
    // eslint-disable-next-line no-template-curly-in-string
    .replaceAll('${sanitizedProductName}', installPrefixName), 'utf-8')
  console.log('Patched linux build target')
}
