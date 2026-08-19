/** Public GitHub release listing for DSH Desktop. */
export const RELEASES_URL = 'https://github.com/rw0104/DSH-desktop/releases'

/** Locale dictionary for the desktop About section. */
export const DESKTOP_ABOUT_LOCALE_DICTIONARY = {
  zh: {
    nav: '关于',
    title: '关于 DSH Desktop',
    subtitle: 'DeepSeek Harness 的桌面工作台。应用会检查已发布的新版本。',
    version: '版本',
    updateMethod: '更新方式',
    manualInstall: '手动下载安装包',
    windowsUpdate: '应用内下载，确认后重启安装',
    macUpdate: '应用内下载，随后手动替换应用',
    repository: '仓库',
    viewRelease: '查看版本与更新说明',
  },
  en: {
    nav: 'About',
    title: 'About DSH Desktop',
    subtitle: 'A desktop workbench for DeepSeek Harness. The app checks published releases for updates.',
    version: 'Version',
    updateMethod: 'Update method',
    manualInstall: 'Download and install manually',
    windowsUpdate: 'Download in app, then confirm restart and install',
    macUpdate: 'Download in app, then replace the application manually',
    repository: 'Repository',
    viewRelease: 'View release and notes',
  },
} as const
