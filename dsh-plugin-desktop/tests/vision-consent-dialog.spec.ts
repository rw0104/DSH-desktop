import { describe, expect, it } from 'vitest'
import { getVisionConsentCopy, isChineseLocale } from '../src/vision-consent-dialog.ts'

describe('vision consent dialog localization', () => {
  it.each(['zh-CN', 'zh-TW', 'zh-Hans', 'ZH'])('recognizes Chinese system locale %s', locale => {
    expect(isChineseLocale(locale)).toBe(true)
  })

  it.each(['en-US', 'ja-JP', '', ' zhx-CN '])('does not misclassify locale %s', locale => {
    expect(isChineseLocale(locale)).toBe(false)
  })

  it('returns Chinese first-run copy', () => {
    expect(getVisionConsentCopy('zh-CN', true)).toEqual(expect.objectContaining({
      title: 'Vision Toolkit 隐私提示',
      buttons: ['启用 Vision Toolkit', '保持停用'],
    }))
  })

  it('returns English disabled copy for non-Chinese locales', () => {
    expect(getVisionConsentCopy('en-US', false)).toEqual(expect.objectContaining({
      title: 'Vision Toolkit is disabled',
      buttons: ['Enable Vision Toolkit', 'Keep Disabled'],
    }))
  })
})
