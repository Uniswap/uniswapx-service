import { PostUnimindHandler } from './handler'
import { PostUnimindInjector } from './injector'

const postUnimindInjectorPromise = new PostUnimindInjector('postUnimindInjector').build()
const postUnimindHandler = new PostUnimindHandler('postUnimindHandler', postUnimindInjectorPromise)

module.exports = {
  postUnimindHandler: postUnimindHandler.handler,
}