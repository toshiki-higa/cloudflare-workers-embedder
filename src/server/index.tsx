import { Hono } from 'hono'
import { Result } from '@praha/byethrow'
import { renderer } from './renderer'
import { doEmbed } from './embed'

const app = new Hono()

app.use(renderer)

app.get('/', (c) => {
  return c.render(<div id="root"></div>)
})

export default app
