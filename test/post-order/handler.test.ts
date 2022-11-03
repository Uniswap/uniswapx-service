import { PostOrderHandler } from "../../lib/handlers/post-order/handler";
import { PostOrderInjector } from "../../lib/handlers/post-order/injector";

const postOrderInjectorPromise = new PostOrderInjector('TEST').build()
const postOrderHandler = new PostOrderHandler('TEST', postOrderInjectorPromise)

postOrderInjectorPromise
postOrderHandler
