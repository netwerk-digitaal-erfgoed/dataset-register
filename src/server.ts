import fastify from 'fastify';

const server = fastify();

server.post('/datasets', (request, reply) => {
  reply.send({hello: 'world'});
});

server.listen(3000);
