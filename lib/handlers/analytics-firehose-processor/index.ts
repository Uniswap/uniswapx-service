import { FirehoseEvent, processFirehoseEvent } from './processor'

export const handler = async (event: FirehoseEvent) => processFirehoseEvent(event)
