/** Public GitHub release listing for DSH Desktop. */
export const RELEASES_URL = 'https://github.com/rw0104/DSH-desktop/releases'

/** Locale dictionary for the desktop About section. */
export const DESKTOP_ABOUT_LOCALE_DICTIONARY = {
  zh: {
    nav: '关于',
    title: '关于 DSH Desktop',
    subtitle: 'DeepSeek Harness 的桌面工作台。版本更新需要下载新的安装包并重新安装。',
    version: '版本',
    updateMethod: '更新方式',
    manualInstall: '手动下载安装包',
    repository: '仓库',
    viewRelease: '查看版本与更新说明',
  },
  en: {
    nav: 'About',
    title: 'About DSH Desktop',
    subtitle: 'A desktop workbench for DeepSeek Harness. Updates require downloading and installing a new package.',
    version: 'Version',
    updateMethod: 'Update method',
    manualInstall: 'Download and install manually',
    repository: 'Repository',
    viewRelease: 'View release and notes',
  },
} as const
