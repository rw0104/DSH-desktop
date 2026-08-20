/** Product-owned support and documentation links for this DSH Desktop distribution. */
export const DSH_DESKTOP_REPOSITORY_URL = 'https://github.com/rw0104/DSH-desktop'
export const DSH_DESKTOP_ISSUES_URL = `${DSH_DESKTOP_REPOSITORY_URL}/issues`

const MARKET_DOCS_URL = `${DSH_DESKTOP_REPOSITORY_URL}/blob/main/dsh-community-market/docs`

export const INSTALL_REQUIREMENTS_DOCS = {
  en: `${MARKET_DOCS_URL}/install-and-uninstall.md`,
  zh: `${MARKET_DOCS_URL}/install-and-uninstall.zh.md`,
} as const

export const CATALOG_ADAPTER_GUIDE_DOCS = {
  en: `${MARKET_DOCS_URL}/catalog-adapter-guide.md`,
  zh: `${MARKET_DOCS_URL}/catalog-adapter-guide.zh.md`,
} as const
