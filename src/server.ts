import fastify from 'fastify';

const server = fastify();

server.post('/datasets', async (request, reply) => {
  reply.send({hello: 'world'});
});

const start = async () => {
  try {
    await server.listen(3000);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}
start();
