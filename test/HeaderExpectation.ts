export class HeaderExpectation {
  private headers: { [header: string]: string | number | boolean } | undefined

  constructor(headers: { [header: string]: string | number | boolean } | undefined) {
    this.headers = headers
  }

  public toReturnJsonContentType() {
    expect(this.headers).toHaveProperty('Content-Type', 'application/json')
    return this
  }

  public toAllowAllOrigin() {
    expect(this.headers).toHaveProperty('Access-Control-Allow-Origin', '*')
    return this
  }

  public toAllowCredentials() {
    expect(this.headers).toHaveProperty('Access-Control-Allow-Credentials', true)
    return this
  }
}
