/** Localized native copy for the Vision Toolkit data-flow consent dialog. */

export interface VisionConsentDialogCopy {
  title: string
  message: string
  detail: string
  buttons: [string, string]
}

export function isChineseLocale(locale: string): boolean {
  return /^zh(?:[-_]|$)/iu.test(locale.trim())
}

export function getVisionConsentCopy(locale: string, firstRun: boolean): VisionConsentDialogCopy {
  if (isChineseLocale(locale)) {
    return firstRun
      ? {
          title: 'Vision Toolkit 隐私提示',
          message: 'Vision Toolkit 可能会将你选择的图片发送到已配置的视觉服务。',
          detail: '只有在你接受服务提供商的数据处理方式后才启用。你可以在 DSH 设置中更换服务地址和 API 密钥。本地裁剪、像素差异、颜色分析和 SVG 工具不需要上传图片。',
          buttons: ['启用 Vision Toolkit', '保持停用'],
        }
      : {
          title: 'Vision Toolkit 已停用',
          message: '当前桌面 Profile 中 Vision Toolkit 处于停用状态。',
          detail: '你可以在 DSH 设置中修复配置并重新启用 Vision Toolkit。',
          buttons: ['启用 Vision Toolkit', '保持停用'],
        }
  }
  return firstRun
    ? {
        title: 'Vision Toolkit privacy',
        message: 'Vision Toolkit can send selected images to its configured vision service.',
        detail: 'Enable it only if you accept the configured provider\'s data handling. You can change the provider and API key in DSH Settings. Local crop, pixel diff, color and SVG tools do not require image upload.',
        buttons: ['Enable Vision Toolkit', 'Keep Disabled'],
      }
    : {
        title: 'Vision Toolkit is disabled',
        message: 'Vision Toolkit is currently disabled for this desktop profile.',
        detail: 'You can repair the configuration and enable Vision Toolkit again in DSH Settings.',
        buttons: ['Enable Vision Toolkit', 'Keep Disabled'],
      }
}
