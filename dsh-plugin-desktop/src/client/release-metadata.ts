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

/** Locale dictionary for the Host-owned plugin market. */
export const DESKTOP_PLUGIN_MARKET_LOCALE_DICTIONARY = {
  zh: {
    nav: '插件市场',
    title: '插件市场',
    subtitle: '从受信任目录安装或删除插件。变更会在重启后生效。',
    profile: '当前 Profile',
    installed: '已安装',
    install: '安装',
    remove: '删除',
    working: '处理中…',
    restart: '安装或删除插件后，应用会请求重启以加载新的插件组合。',
    error: '操作失败',
  },
  en: {
    nav: 'Plugin market',
    title: 'Plugin market',
    subtitle: 'Install or remove plugins from the trusted catalog. Changes apply after restart.',
    profile: 'Active profile',
    installed: 'Installed',
    install: 'Install',
    remove: 'Remove',
    working: 'Working…',
    restart: 'The app requests a restart after plugin changes so the new composition can load.',
    error: 'Operation failed',
  },
} as const
