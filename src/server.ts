import fastify from 'fastify';

const server = fastify();

const datasetsRequest = {
  schema: {
    body: {
      type: 'object',
      required: ['@id'],
      properties: {
        '@id': { type: 'string' }
      }
    }
  }
};

server.post('/datasets', datasetsRequest, async (request, reply) => {
  // @ts-ignore
  const url = request.body['@id'];
  reply.send(url);
});

server.addContentTypeParser('application/ld+json', { parseAs: 'string' }, function (req, body: string, done) {
  try {
    done(null, JSON.parse(body));
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
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
