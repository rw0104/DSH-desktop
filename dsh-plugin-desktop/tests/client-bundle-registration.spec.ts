import { describe, expect, it } from 'vitest'
import { verifyClientRegistrations } from '../scripts/verify-client-bundles.ts'

describe('served client bundle registrations', () => {
  const typert = 'window.__ModuleLoader__.load({id: "typert", factory: () => { throw new Error("must stay lazy") }});'

  it('rejects a later syntax error before accepting the first plugin in a combo', () => {
    const broken = 'window.__ModuleLoader__.load({id: "model", factory: () => ({children: {}, model.inputModalities})});'
    expect(() => verifyClientRegistrations(typert + broken, ['typert', 'model'], 'combo.js'))
      .toThrow('Unexpected token')
  })

  it('registers all combo factories without executing their bodies', () => {
    const model = 'window.__ModuleLoader__.load({id: "model", factory: () => ({children: [{}, model.inputModalities]})});'
    expect(() => verifyClientRegistrations(typert + model, ['typert', 'model'], 'combo.js')).not.toThrow()
  })

  it('rejects missing, wrong, duplicate, and non-function registrations', () => {
    expect(() => verifyClientRegistrations('', ['typert'], 'missing.js')).toThrow('expected typert')
    expect(() => verifyClientRegistrations(typert, ['model'], 'wrong.js')).toThrow('received typert')
    expect(() => verifyClientRegistrations(typert + typert, ['typert'], 'duplicate.js')).toThrow('received typert, typert')
    expect(() => verifyClientRegistrations('window.__ModuleLoader__.load({id:"typert", factory:0})', ['typert'], 'invalid.js'))
      .toThrow('invalid client registration')
  })
})
