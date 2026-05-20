import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import {
  decodeFromShareUrl,
  encodeForShareUrl,
} from './share-link.js';

const LIMA_TURTLE = `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix schema:<http://schema.org/> .

<https://data.mediakunst.net/dataset/lima-single-channel-artworks>
    a schema:Dataset ;
    schema:identifier "https://data.mediakunst.net/dataset/lima-single-channel-artworks"^^xsd:string ;
    schema:name "Dataset of single channel video artworks from the Li-MA collection"@en, "Dataset van eenkanaalse videokunstwerken uit de LI-MA collectie"@nl ;
    schema:description "A dataset consisting of all single channel video artworks that exist in the collection LI-MA - Living Media Art."@en, "Een dataset bestaande uit alle eenkanaalse videokunstwerken die zich bevinden in de collectie van LI-MA - Living Media Art."@nl ;
    schema:creator <https://li-ma.nl/> ;
    schema:publisher <https://li-ma.nl/> ;
    schema:about <http://vocab.getty.edu/aat/300102067> ;
    schema:temporalCoverage "1960/.." ;
    schema:dateCreated "2026-03-19"^^schema:Date ;
    schema:dateModified "2026-03-19"^^schema:Date ;
    schema:datePublished "2026-03-19"^^schema:Date ;
    schema:inLanguage "nl-NL"^^xsd:string, "en-US"^^xsd:string ;
    schema:version "1.0"^^xsd:string ;
    schema:keywords "mediakunst"@nl, "digitale kunst"@nl, "digital art"@en, "media art"@en ;
    schema:license <https://creativecommons.org/publicdomain/zero/1.0/> ;
    schema:includedInDataCatalog <https://data.mediakunst.net/datacatalog> ;
    schema:distribution [
        a schema:DataDownload ;
        schema:name "Datadump in RDF"^^xsd:string ;
        schema:description "Datadump in turtle formaat van de single channel videowerken uit de LI-Ma collectie."@nl, "Datadump in RDF turtle format of the single channel artworks in the LI-MA-collection." ;
        schema:encodingFormat "text/turtle"^^xsd:string ;
        schema:dateCreated "2026-03-19"^^schema:Date ;
        schema:dateModified "2026-03-19"^^schema:Date ;
        schema:datePublished "2026-03-19"^^schema:Date ;
        schema:inLanguage "nl-NL"^^xsd:string, "en-US"^^xsd:string ;
        schema:contentUrl <https://data.mediakunst.net/dataset/lima-single-channel-artworks.ttl> ;
        schema:license <https://creativecommons.org/publicdomain/zero/1.0/>
    ]
.

<https://data.mediakunst.net/datacatalog>
    a schema:DataCatalog  ;
    schema:name "Open Data collectie van LI-MA"@nl, "Open Data collection of LI-MA"@en ;
    schema:description "Alle open data beschikbaar gesteld door LI-MA"@nl, "All open datasets ad published by LI-MA."@en ;
    schema:publisher <https://li-ma.nl/> ;
    schema:dataset <https://data.mediakunst.net/dataset/lima-single-channel-artworks> .

<https://li-ma.nl/>
    a schema:Organization ;
    schema:name "LI-MA Mediakunst"@nl, "LI-MA Digital art"@en ;
    schema:identifier "NL-lima"^^xsd:string ;
    schema:contactPoint [
        a schema:ContactPoint ;
        schema:email "contact@li-ma.nl"^^xsd:string ;
        schema:name "Joost Dofferhoff"^^xsd:string
    ] .`;

describe('share-link', () => {
  it('round-trips arbitrary text exactly', async () => {
    const encoded = await encodeForShareUrl(LIMA_TURTLE);
    expect(await decodeFromShareUrl(encoded)).toBe(LIMA_TURTLE);
  });

  it('decodes legacy lz-string fragments produced before this change', async () => {
    const legacy = compressToEncodedURIComponent(LIMA_TURTLE);
    expect(await decodeFromShareUrl(legacy)).toBe(LIMA_TURTLE);
  });

  it('produces a meaningfully shorter URL fragment than lz-string', async () => {
    const next = await encodeForShareUrl(LIMA_TURTLE);
    const legacy = compressToEncodedURIComponent(LIMA_TURTLE);
    // Sanity baseline so a regression in the encoder gets caught.
    expect(next.length).toBeLessThan(legacy.length * 0.65);
  });

  it('decodes its own empty-string output', async () => {
    const encoded = await encodeForShareUrl('');
    expect(await decodeFromShareUrl(encoded)).toBe('');
  });

  it('returns undefined for garbage in the current format', async () => {
    expect(await decodeFromShareUrl('~1!!!not-base64!!!')).toBeUndefined();
  });
});
