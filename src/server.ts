import fastify from 'fastify';
import {
  IQueryResultBindings,
  IQueryResultQuads,
  newEngine,
} from '@comunica/actor-init-sparql';

const server = fastify();

const datasetsRequest = {
  schema: {
    body: {
      type: 'object',
      required: ['@id'],
      properties: {
        '@id': {type: 'string'},
      },
    },
  },
};

const comunica = newEngine();

server.post('/datasets', datasetsRequest, async (request, reply) => {
  const url = (request.body as {'@id': string})['@id'];

  const selectResult = (await comunica.query(
    `
    SELECT ?s ?p ?o WHERE {
      ?s a schema:Dataset ;
        schema:name ?name ;
        ?p ?o . 
    }
    `,
    {sources: [url]}
  )) as IQueryResultBindings;
  selectResult.bindingsStream.on('data', binding => {
    console.log(binding.get('?s').value);
    console.log(binding.get('?s').termType);
    console.log(binding.get('?p').value);
    console.log(binding.get('?o').value);
  });

  const constructResult = (await comunica.query(
    `
    CONSTRUCT {
      ?s a schema:Dataset ;
        schema:identifier ?identifier ;
        schema:name ?name ;
        schema:description ?description ;
        schema:creator ?creator ;
        schema:license ?license ;
        schema:url ?url ;
        schema:keywords ?keywords ;
        schema:distribution ?distribution .
      ?distribution schema:encodingFormat ?encodingFormat ;
        schema:contentUrl ?contentUrl .
    } 
    WHERE {
      ?s a schema:Dataset ;
        schema:identifier ?identifier ;
        schema:name ?name ;
        schema:description ?description ;
        schema:creator ?creator ;
        schema:license ?license ;
        schema:distribution ?distribution .
      ?d schema:encodingFormat ?encodingFormat ;
        schema:contentUrl ?contentUrl .
      OPTIONAL { ?s schema:url ?url . }
      OPTIONAL { ?s schema:keywords ?keywords . }
    }
    `,
    {sources: [url]}
  )) as IQueryResultQuads;

  const {data} = await comunica.resultToString(
    constructResult,
    'application/ld+json'
  );
  reply.send(data);

  // const store = new Store();
  // store.import(constructResult.quadStream);
  //
  // const writer = new Writer();
  // constructResult
  //   .quadStream.on('data', (q) => {
  //     writer.addQuad(q);
  //   })
  //   .on('end', () => {
  //     writer.end((error, result) => reply.send(result));
  //   });

  // writer.addQuads(store.getQuads('', null, null, null));
  // writer.addQuad(new Quad(namedNode('http://bla'), namedNode('http://bli.com'), namedNode('http://ding')));

  // const streamWriter = new StreamWriter();
  // const data = streamWriter.import(store.match());

  // writer.end((error, result) => reply.send('hoi' + error + result));
  // reply.send();

  // store.addQuads(await constructResult.quads());

  // constructResult
  //   .quadStream.on('data', (quad) => {
  //   console.log(quad.subject.value + ' ' + quad.predicate.value + ' ' + quad.object.value );
  // });
  // selectResult.quadStream.on('error', (error) => {
  //   console.log('error', error);
  // });

  // console.log('quads', await selectResult.quads());

  // console.log('bindings', result.bindings());
  // result.bindingsStream.on('data', (binding) => {
  //   console.log(binding.get('?s').value);
  //   console.log(binding.get('?p').value);
  //   console.log(binding.get('?o').value);
  // });

  // reply.send(url);
});

server.addContentTypeParser(
  'application/ld+json',
  {parseAs: 'string'},
  (req, body: string, done) => {
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err, undefined);
    }
  }
);

(async () => {
  try {
    await server.listen(3000, '0.0.0.0');
  } catch (err) {
    console.error(err);
  }
})();
