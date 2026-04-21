// The Zod schema in constants.ts validates unimind constants at module load time.
// This test simply verifies the module loads without throwing.
describe('Unimind constants sanity checks', () => {
  it('should pass Zod validation on import', () => {
    expect(() => require('../../../lib/util/constants')).not.toThrow()
  })
})
