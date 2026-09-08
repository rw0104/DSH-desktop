const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
app.disableHardwareAcceleration()
app.setPath('userData', require('node:path').join(require('node:os').tmpdir(), 'surface-user-data'))
const watchdog = setTimeout(() => app.exit(1), 150_000)

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { offscreen: true, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } })
  const run = source => window.webContents.executeJavaScript(source)
  const wait = async source => {
    const deadline = Date.now() + 5_000
    while (!await run(source)) {
      assert.ok(Date.now() < deadline, `Surface condition timed out: ${source}`)
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }
  const click = async (label, role = 'button') => {
    await wait(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(role === 'button' ? 'button' : `[role="${role}"]`)})].find(el=>(el.getAttribute('aria-label')||el.textContent.trim())===${JSON.stringify(label)});return !!el&&el.getClientRects().length>0&&!el.closest('[inert]')})()`)
    await run(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(role === 'button' ? 'button' : `[role="${role}"]`)})].find(el=>(el.getAttribute('aria-label')||el.textContent.trim())===${JSON.stringify(label)});const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(!el.contains(hit))throw Error('Covered control: '+${JSON.stringify(label)});el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));el.focus();el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));el.click()})()`)
  }
  const escape = async () => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  }
  const shown = label => `(()=>{const el=[...document.querySelectorAll('[role="dialog"],dialog')].find(el=>(el.getAttribute('aria-label')||document.getElementById(el.getAttribute('aria-labelledby'))?.textContent)===${JSON.stringify(label)});return !!el&&el.getClientRects().length>0})()`
  const report = []
  try {
    for (const [width, height] of [[1280, 800], [1920, 1080], [800, 600]]) {
      window.setSize(width, height)
      await window.loadFile(process.argv[2])
      await click('设置')
      await wait(shown('设置'))
      assert.equal(await run('getComputedStyle(document.querySelector(fixture.mask)).backdropFilter'), 'blur(2px)')
      await run('fixture.install()')
      assert.deepEqual(await run('(()=>{const masks=[...document.querySelectorAll(fixture.mask)];return masks.map(el=>[getComputedStyle(el).backgroundColor,getComputedStyle(el).backdropFilter])})()'), [['rgba(0, 0, 0, 0.12)', 'none']])
      await run("document.body.setAttribute('data-ds-dark-theme','')")
      assert.equal(await run('getComputedStyle(document.querySelector(fixture.mask)).backgroundColor'), 'rgba(0, 0, 0, 0.24)')
      await run("document.body.removeAttribute('data-ds-dark-theme')")
      await click('语言：中文')
      await click('English', 'menuitem')
      await click('语言：English')
      await escape()
      await wait("!document.querySelector('[role=menu]')")
      assert.equal(await run(shown('设置')), true)
      for (const [trigger, title] of [['打开上游图片', '上游图片预览'], ['打开原图预览', '原图预览'], ['打开嵌套确认', '嵌套确认']]) {
        await click(trigger)
        await wait(shown(title))
        await escape()
        await wait(`!(${shown(title)})`)
        assert.equal(await run(shown('设置')), true, title)
      }
      for (let index = 0; index < 20; index++) {
        await click('关闭设置')
        await wait('document.querySelector(\'[data-slot="sidebar.settings"] button\')===document.activeElement')
        assert.equal(await run('document.querySelectorAll("[inert]").length'), 0)
        await click('设置')
        await wait(shown('设置'))
        await click('通用设置')
        await click('Agent 预设')
      }
      await click('关闭设置')
      await wait('document.querySelectorAll("[inert]").length===0')
      await click('开始语音对话')
      await wait('fixture.counters.tickets===1')
      assert.equal(await run(shown('实时语音')), true)
      assert.equal(await run('fixture.counters.microphone'), 0)
      await run('fixture.active(); fixture.task()')
      await wait('!!document.querySelector(".dshVoiceCompact")')
      await click('展开语音对话')
      await wait(shown('实时语音'))
      assert.equal(await run('fixture.counters.tickets'), 1)
      await click('设置')
      await wait(shown('设置'))
      assert.equal(await run('fixture.voice.isActive()'), true)
      await escape()
      await wait(`!(${shown('设置')})`)
      assert.equal(await run('fixture.voice.isActive()'), true)
      await click('关闭实时语音')
      await wait('fixture.counters.stopped===1&&fixture.counters.closed===1')
      await click('设置')
      await wait(shown('设置'))
      await run("fixture.voice.openAndStart('surface-session')")
      assert.equal(await run('fixture.counters.tickets'), 1)
      assert.equal(await run('fixture.voice.getSnapshot().error'), 'voice_panel_not_visible')
      await escape()
      await wait(`!(${shown('设置')})`)
      await run('fixture.unmount()')
      assert.deepEqual(await run('window.__surfaceErrors'), [])
      report.push({ width, height, themeMask: true, portalMenu: true, nestedEscape: true, focusAndInertRestored: true, voiceVisibleAndRestored: true, coveredVoiceNoCapture: true, cycles: 20 })
    }
    console.log(`verify-desktop-surfaces: ${JSON.stringify(report)}`)
    window.destroy()
    clearTimeout(watchdog)
    app.exit(0)
  } catch (error) {
    console.error(error)
    console.error('renderer errors:', await run('window.__surfaceErrors').catch(() => []))
    window.destroy()
    clearTimeout(watchdog)
    app.exit(1)
  }
}).catch(error => { console.error(error); app.exit(1) })
