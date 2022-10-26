export abstract class BaseOrdersRepository {
  public abstract getByHash(hash: string): Promise<any>
  public abstract put(order: any): Promise<void>
}
