import { z } from 'zod';
import { chatSendPayloadSchema } from '../ws/ws.schemas';

/**
 * `chat.send` command, published by the gateway for each valid `chat.send`
 * frame: the frame's payload plus who sent it (from the socket, never from
 * the frame) and when the gateway accepted it.
 */
export const chatSendCommandSchema = chatSendPayloadSchema.extend({
  userId: z.uuid(),
  requestedAt: z.iso.datetime(),
});

export type ChatSendCommand = z.infer<typeof chatSendCommandSchema>;
