import express from 'express'
import { log } from '../Logging'

export interface IHealthCheckServer {
  listen(port: number): Promise<void>
}

export class HealthCheckServer implements IHealthCheckServer {
  private app: express.Application

  constructor(private listenerPort: number) {
    this.app = express()

    this.app.get('/', (_req, res) => {
      log.info(`Health check pinged`)
      res.sendStatus(200)
    })
  }

  async listen(): Promise<void> {
    this.app.listen(this.listenerPort, () => {
      log.info(`Health check server listening at http://localhost:${this.listenerPort}`)
    })
  }
}
