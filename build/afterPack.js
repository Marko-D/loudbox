// electron-builder hook: stamp Loudbox's icon and version info into Loudbox.exe.
// electron-builder's own step for this needs Windows Developer Mode or admin rights
// (it unpacks macOS symlinks), so the build turns it off and does it here with rcedit.
// Without this, a pinned taskbar icon shows Electron's logo.
const path = require('path');
const rcedit = require('rcedit');

module.exports = async (context) => {
  if (context.electronPlatformName !== 'win32') return;
  const { appInfo } = context.packager;
  const exe = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const version = appInfo.version;
  await rcedit(exe, {
    icon: path.join(__dirname, 'icon.ico'),
    'file-version': version,
    'product-version': version,
    'version-string': {
      ProductName: appInfo.productName,
      FileDescription: appInfo.productName,
      CompanyName: appInfo.productName,
      LegalCopyright: '',
      OriginalFilename: `${appInfo.productFilename}.exe`,
      InternalName: appInfo.productName,
    },
  });
  console.log(`  • stamped Loudbox icon and version ${version} into ${path.basename(exe)}`);
};
