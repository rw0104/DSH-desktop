/** Runs only in isolated test Profiles; never part of the packaged product graph. */
window.__ModuleLoader__.load({
  id: 'dsh-desktop-host-services-smoke-plugin',
  factory: () => ({
    inject: ['sessions', 'workspaces', 'conversation', 'betterSidebar'],
    apply(ctx) {
      const check = (condition, message) => { if (!condition) throw new Error(message) }
      const settle = () => new Promise(resolve => setTimeout(resolve, 30))
      const probe = {
        async checkSessionLifetimes() {
          const workspace = ctx.workspaces.list.getSnapshot().items[0]
          check(workspace, 'A fixture workspace is required')
          const ids = await Promise.all([0, 1].map(() => ctx.sessions.create({ workspaceId: workspace.workspaceId })))
          check(ids[0] !== ids[1], 'Two create calls must return distinct Session identities')
          const first = ctx.sessions.retain(ids[0], { source: 'controllerOperation' })
          const duplicate = ctx.sessions.retain(ids[0], { source: 'controllerOperation' })
          const second = ctx.sessions.retain(ids[1], { source: 'controllerOperation' })
          const releases = [first, duplicate, second]
          try {
            await Promise.all(releases.map(reference => reference.ready))
            const left = first.binding, right = second.binding
            check(left === duplicate.binding && left !== right, 'Bindings must be shared only within one Session')
            const a = ctx.conversation.input.for(left.ctx)
            const b = ctx.conversation.input.for(right.ctx)
            a.setDraft('Independent draft A')
            b.setDraft('Independent draft B')
            await settle()
            check(a.state.getSnapshot().draft === 'Independent draft A', 'Draft A was overwritten')
            check(b.state.getSnapshot().draft === 'Independent draft B', 'Draft B was overwritten')
            const events = []
            const sidebar = ctx.betterSidebar
            const selected = sidebar.getSnapshot().sessionId
            const off = sidebar.registerTab({ id: 'alpha-scope-probe', title: 'Scope probe', component: () => null,
              onOpen: (tab, scope) => events.push(['open', tab.id, scope.sessionId]),
              onClose: (tab, scope) => events.push(['close', tab.id, scope.sessionId]),
            })
            try {
              sidebar.openTab({ type: 'alpha-scope-probe', id: 'scope-a' }, { sessionId: ids[0] })
              sidebar.openTab({ type: 'alpha-scope-probe', id: 'scope-b' }, { sessionId: ids[1] })
              check(sidebar.getSnapshot().sessionId === selected, 'Opening an inactive Session tab changed the main Session')
              sidebar.closeTab('scope-a', { sessionId: ids[0] })
              sidebar.closeTab('scope-b', { sessionId: ids[1] })
              check(events.filter(event => event[0] === 'open').length === 2, 'Both scoped tabs must open')
              check(events.filter(event => event[0] === 'close').length === 2, 'Both scoped tabs must close')
              check(events.every(event => event[2] === (event[1] === 'scope-a' ? ids[0] : ids[1])), 'Sidebar lifecycle crossed Session scopes')
            } finally { off() }
            first.release()
            check(duplicate.binding === left, 'One reference release disposed another owner')
            duplicate.release(); second.release()
            await settle()
            check(ctx.sessions.retainInfo(ids[0]).getSnapshot().referenceCount === 0, 'Session A references leaked')
            check(ctx.sessions.retainInfo(ids[1]).getSnapshot().referenceCount === 0, 'Session B references leaked')
            const reopened = ctx.sessions.retain(ids[0], { source: 'controllerOperation' })
            releases.push(reopened)
            await reopened.ready
            check(reopened.binding !== left, 'Reopening reused a disposed Client generation')
            return { distinctSessions: true, sharedReferences: true, draftIsolation: true, scopedTabs: events.length, releaseAndReopen: true }
          } finally { for (const reference of releases) reference.release() }
        },
      }
      window.__desktopProfileSmoke = probe
      ctx.effect(() => () => { if (window.__desktopProfileSmoke === probe) delete window.__desktopProfileSmoke }, 'smoke: client probe lifetime')
    },
  }),
})
