import factory from 'rdf-ext';
import type { NamedNode, Quad } from '@rdfjs/types';
import { hashSuffix, skolemIri } from '@lde/dataset';
import type { ValidityVerdict } from '@lde/distribution-health';
import { rdf, xsd } from './query.js';

const dqv = (property: string): NamedNode =>
  factory.namedNode(`http://www.w3.org/ns/dqv#${property}`);
const prov = (property: string): NamedNode =>
  factory.namedNode(`http://www.w3.org/ns/prov#${property}`);
const failure = (property: string): NamedNode =>
  factory.namedNode(`https://def.nde.nl/failure#${property}`);
const probe = (property: string): NamedNode =>
  factory.namedNode(`https://def.nde.nl/probe#${property}`);

// The DQV boolean metric a validity measurement is of (definitions#3). Its
// subject is the distribution's access URL – the file itself – because validity
// is a property of the bytes, not of any dataset's use of them.
const VALIDITY_METRIC = factory.namedNode(
  'https://def.nde.nl/metric#distribution-rdf-valid',
);
// The serialization-agnostic SKOS failure scheme; the verdict's reason local
// name (`parse-error` / `empty`) drops straight onto `<scheme>#${reason}`.
const VALIDITY_FAILURE_SCHEME =
  'https://def.nde.nl/distribution-validity-failure#';

/** Provenance context stamped onto a verdict's quads. */
export interface ValidityProvenance {
  /** The distribution's access URL – the subject the verdict is about. */
  distributionUrl: string;
  /** When the verdict was produced. */
  generatedAt: Date;
  /** IRI of the software that produced the verdict (producer attribution). */
  producer: string;
}

/**
 * Map an RDF-validity {@link ValidityVerdict} to `def.nde.nl` DQV/PROV quads: a
 * `dqv:QualityMeasurement` of `metric:distribution-rdf-valid`, computed on the
 * distribution itself, stamped with the producer, the time, and the
 * `probe:sourceFingerprint` it was judged against. An invalid verdict adds the
 * PROV qualified-usage failure shape (`failure:reason` + optional
 * `failure:message`).
 *
 * This mirrors the deep producer's mapping in dataset-knowledge-graph
 * (`distributionValidityQuads`) quad-for-quad so the Register's shallow output
 * and the DKG's deep output are structurally identical: the only difference
 * between them is depth, which a consumer reads from which endpoint served the
 * measurement, not from the RDF (PRD #2103). The structural nodes are skolem
 * IRIs derived from the distribution, not blank nodes, so distinct
 * distributions' nodes cannot collide and a re-run is idempotent.
 */
export function distributionValidityQuads(
  verdict: ValidityVerdict,
  provenance: ValidityProvenance,
): Quad[] {
  const distribution = factory.namedNode(provenance.distributionUrl);
  const measurement = factory.namedNode(
    skolemIri(distribution.value, 'measurement', 'distribution-rdf-valid'),
  );
  const activity = factory.namedNode(
    skolemIri(distribution.value, 'validity-activity'),
  );

  const quads: Quad[] = [
    factory.quad(measurement, rdf('type'), dqv('QualityMeasurement')),
    factory.quad(measurement, dqv('computedOn'), distribution),
    factory.quad(measurement, dqv('isMeasurementOf'), VALIDITY_METRIC),
    factory.quad(
      measurement,
      dqv('value'),
      factory.literal(verdict.valid ? 'true' : 'false', xsd('boolean')),
    ),
    factory.quad(
      measurement,
      prov('generatedAtTime'),
      factory.literal(provenance.generatedAt.toISOString(), xsd('dateTime')),
    ),
    factory.quad(measurement, prov('wasGeneratedBy'), activity),
    factory.quad(activity, rdf('type'), prov('Activity')),
    factory.quad(
      activity,
      prov('wasAssociatedWith'),
      factory.namedNode(provenance.producer),
    ),
  ];

  if (verdict.validatedFingerprint !== null) {
    quads.push(
      factory.quad(
        measurement,
        probe('sourceFingerprint'),
        factory.literal(verdict.validatedFingerprint),
      ),
    );
  }

  if (!verdict.valid && verdict.reason !== undefined) {
    const usage = factory.namedNode(
      skolemIri(activity.value, 'usage', hashSuffix(distribution.value)),
    );
    quads.push(
      // `prov:used` accompanies the qualified usage, per PROV convention.
      factory.quad(activity, prov('used'), distribution),
      factory.quad(activity, prov('qualifiedUsage'), usage),
      factory.quad(usage, rdf('type'), prov('Usage')),
      factory.quad(usage, prov('entity'), distribution),
      factory.quad(
        usage,
        failure('reason'),
        factory.namedNode(`${VALIDITY_FAILURE_SCHEME}${verdict.reason}`),
      ),
    );
    if (verdict.message !== undefined) {
      quads.push(
        factory.quad(
          usage,
          failure('message'),
          factory.literal(verdict.message),
        ),
      );
    }
  }

  return quads;
}
