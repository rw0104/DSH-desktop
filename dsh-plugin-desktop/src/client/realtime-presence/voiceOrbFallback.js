/*! III.PICS Team, MIT. Adapted from pm01 realtime-presence, snapshot 5dcac08bdf9ab81c1c729ff50c5fadc8962eb45b. See THIRD_PARTY_NOTICES.md. */
export function drawVoiceOrbFallback(canvas, status = 'idle', maxPixelRatio = 2) {
  const context = canvas.getContext('2d');
  if (!context) return false;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(width / 2, height / 2);
  const radius = Math.min(width, height) * 0.292;
  const quietState = ['ended', 'error', 'microphone_interrupted'].includes(status);

  context.shadowColor = `rgba(125, 148, 255, ${quietState ? 0.08 : 0.12})`;
  context.shadowBlur = radius * 0.1;
  const body = context.createLinearGradient(0, -radius, 0, radius);
  body.addColorStop(0, '#7d84ff');
  body.addColorStop(0.4, '#869dff');
  body.addColorStop(0.58, '#fafbff');
  body.addColorStop(1, '#e9edff');
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fillStyle = body;
  context.fill();
  context.shadowBlur = 0;
  context.clip();

  const clouds = [
    [-0.46, -0.14, 0.62, '206,218,255'], [0.36, -0.08, 0.7, '229,235,255'],
    [-0.12, 0.18, 0.72, '255,255,255'], [0.5, 0.24, 0.52, '232,239,255'],
    [-0.5, 0.28, 0.5, '247,249,255'], [0.08, -0.54, 0.44, '159,166,255'],
  ];
  clouds.forEach(([x, y, size, color], index) => {
    const cloud = context.createRadialGradient(radius * x, radius * y, 0, radius * x, radius * y, radius * size);
    cloud.addColorStop(0, `rgba(${color}, ${index % 2 ? 0.42 : 0.56})`);
    cloud.addColorStop(1, `rgba(${color}, 0)`);
    context.fillStyle = cloud;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
  });
  context.restore();
  return true;
}
