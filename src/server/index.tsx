import { Hono } from 'hono'
import { renderer } from './renderer'
import { doEmbed, type EmbedRequest } from './embed'

const app = new Hono()

app.use(renderer)

app.get('/', (c) => {
  return c.render(<div id="root"></div>)
})

app.post('/api/embed', async (c) => {
  const { text } = await c.req.json<EmbedRequest>()

  try {
    const embedding = await doEmbed(text)
    return c.json({ success: true, embedding })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to embed'
    return c.json({ success: false, error: message }, 500)
  }
})

export default app
