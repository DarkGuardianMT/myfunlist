import { createServer } from 'node:net'

const server = createServer()

server.once('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('Backend port 8080 is already in use. Stop the existing server and try again.')
  } else {
    console.error(`Could not check backend port 8080: ${error.message}`)
  }
  process.exitCode = 1
})

server.listen({ host: '127.0.0.1', port: 8080, exclusive: true }, () => server.close())
