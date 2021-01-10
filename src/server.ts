import fastify from 'fastify';
import {IQueryResultQuads, newEngine} from '@comunica/actor-init-sparql';
import {ShaclValidator} from './validator';
import * as https from 'https';
import factory from 'rdf-ext';
import {StreamWriter} from 'n3';
import {toStream} from 'rdf-dataset-ext';

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

  https.get(url, async res => {
    // Ensure the dataset description URL exists.
    if (res.statusCode! < 200 || res.statusCode! > 400) {
      console.log('not found');
      reply.code(404).send('No dataset description found at ' + url);
      return;
    }

    // Find dataset description RDF at the URL.
    const constructResult = (await comunica.query(
      `
      CONSTRUCT {
        ?s a schema:Dataset ;
          schema:identifier ?identifier ;
          schema:name ?name ;
          schema:description ?description ;
          schema:creator ?creator ;
          schema:license ?license ;
          schema:distribution ?distribution ;
          schema:url ?url ;
          schema:keywords ?keywords .
         
        ?distribution a schema:DataDownload ;       
          schema:encodingFormat ?encodingFormat ;
          schema:contentUrl ?contentUrl .
        ?creator a schema:Organization ;
          schema:name ?creatorName .                   
      }   
      WHERE {
        ?s a schema:Dataset ;
          schema:identifier ?identifier ;
          schema:name ?name ;
          schema:description ?description ;
          schema:creator ?creator ;
          schema:license ?license ;
          schema:distribution ?distribution .
        ?distribution a schema:DataDownload ; 
          schema:encodingFormat ?encodingFormat ;
          schema:contentUrl ?contentUrl .
        ?creator a schema:Organization ; 
          schema:name ?creatorName .
        OPTIONAL { ?s schema:url ?url . }
        OPTIONAL { ?s schema:keywords ?keywords . }
      }`,
      {sources: [url]}
    )) as IQueryResultQuads;

    // Based on dereferenced URL.
    // const result = await rdfDereferencer.dereference(url);
    // const store = await factory
    //   .dataset()
    //   // @ts-ignore
    //   .import(result.quads);
    // // @ts-ignore
    // const validationReport = await validator.validate(storeFromQuery);
    // if (!validationReport.conforms) {
    //   const streamWriter = new StreamWriter();
    //   const validationRdf = streamWriter.import(toStream(validationReport.dataset));
    //   reply.code(400).send(validationRdf);
    //   return;
    // }

    // Validate the RDF using SHACL.
    const storeFromQuery = await factory
      .dataset()
      .import(constructResult.quadStream);

    if (storeFromQuery.size === 0) {
      reply.code(400).send();
      return;
    }

    const queryResultValidationReport = await validator.validate(
      storeFromQuery
    );
    if (!queryResultValidationReport.conforms) {
      const streamWriter = new StreamWriter();
      const validationRdf = streamWriter.import(
        toStream(queryResultValidationReport.dataset)
      );
      reply.code(400).send(validationRdf);
      return;
    }

    reply.code(202).send();
  });

  // const selectResult = (await comunica.query(
  //   `
  //   SELECT ?s ?p ?o WHERE {
  //     ?s a schema:Dataset ;
  //       schema:name ?name ;
  //       ?p ?o .
  //   }
  //   `,
  //   {sources: [url]}
  // )) as IQueryResultBindings;
  // selectResult.bindingsStream.on('data', binding => {
  //   console.log(binding.get('?s').value);
  //   console.log(binding.get('?s').termType);
  //   console.log(binding.get('?p').value);
  //   console.log(binding.get('?o').value);
  // });
  /*
  try {
    comunica.query(
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
    )
      .catch(() => console.error('NOPE'))
      .then(constructResult => console.log(constructResult));

    // const {data} = await comunica.resultToString(
    //   constructResult,
    //   'application/ld+json'
    // );

  } catch (e) {
    console.log('error', e);
  }


  // TODO: don't do this but a simple status code.


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
  */
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

let validator: ShaclValidator;

(async () => {
  try {
    validator = await ShaclValidator.fromUrl('shacl/dataset.jsonld');
    await server.listen(3000, '0.0.0.0');
  } catch (err) {
    console.error(err);
  }
})();
