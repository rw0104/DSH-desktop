export function parseCssRgb(value) {
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/u.exec(value)
  if (match === null) throw new Error(`unsupported CSS color: ${value}`)
  return match.slice(1, 4).map(Number)
}

export function countForegroundPixels(data, channels, foreground, background) {
  if (channels < 3) throw new Error(`expected at least 3 channels, received ${channels}`)
  let count = 0
  for (let offset = 0; offset < data.length; offset += channels) {
    if (channels >= 4 && data[offset + 3] === 0) continue
    let foregroundDistance = 0
    let backgroundDistance = 0
    for (let channel = 0; channel < 3; channel += 1) {
      foregroundDistance += (data[offset + channel] - foreground[channel]) ** 2
      backgroundDistance += (data[offset + channel] - background[channel]) ** 2
    }
    if (foregroundDistance < backgroundDistance * 0.7) count += 1
  }
  return count
}

export function terminalTextIsPainted(foregroundPixels, width, height) {
  return foregroundPixels >= Math.max(8, Math.floor(width * height * 0.003))
}
