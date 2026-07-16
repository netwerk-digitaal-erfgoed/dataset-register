import * as m from '$lib/paraglide/messages';

/**
 * Human-readable label for the class of a validation result's focus node.
 *
 * Shapes deliberately share one `sh:message` across class shapes – a missing
 * description reads ‘Voeg een beschrijving toe’ whether it is the catalog, the
 * dataset or a distribution that lacks one – and rely on `sh:focusNode` to carry
 * the subject. A blank-node focus node has no IRI worth showing, which leaves the
 * message without a subject, so name the subject by its rdf:type instead.
 *
 * Both schema.org prefixes are accepted: focus-node types are read from the
 * unmodified source, which may use http://schema.org/ where the shapes and the
 * validation report use https://schema.org/.
 */
export function subjectLabel(classIri: string | undefined): string | undefined {
  if (!classIri) return undefined;
  return labelByClass[standardizeSchemaOrgPrefix(classIri)]?.();
}

const SCHEMA = 'https://schema.org/';
const DCAT = 'http://www.w3.org/ns/dcat#';
const VCARD = 'http://www.w3.org/2006/vcard/ns#';
const FOAF = 'http://xmlns.com/foaf/0.1/';

const labelByClass: Record<string, () => string> = {
  [`${SCHEMA}DataCatalog`]: m.validate_subject_data_catalog,
  [`${DCAT}Catalog`]: m.validate_subject_data_catalog,
  [`${SCHEMA}Dataset`]: m.validate_subject_dataset,
  [`${DCAT}Dataset`]: m.validate_subject_dataset,
  [`${SCHEMA}DataDownload`]: m.validate_subject_distribution,
  [`${DCAT}Distribution`]: m.validate_subject_distribution,
  [`${SCHEMA}Organization`]: m.validate_subject_organization,
  [`${FOAF}Organization`]: m.validate_subject_organization,
  [`${FOAF}Agent`]: m.validate_subject_organization,
  [`${SCHEMA}Person`]: m.validate_subject_person,
  [`${FOAF}Person`]: m.validate_subject_person,
  [`${SCHEMA}ContactPoint`]: m.validate_subject_contact_point,
  [`${VCARD}Kind`]: m.validate_subject_contact_point,
  [`${VCARD}Organization`]: m.validate_subject_contact_point,
  [`${VCARD}Individual`]: m.validate_subject_contact_point,
  [`${SCHEMA}PropertyValue`]: m.validate_subject_identifier,
};

function standardizeSchemaOrgPrefix(classIri: string): string {
  return classIri.startsWith('http://schema.org/')
    ? classIri.replace('http://schema.org/', SCHEMA)
    : classIri;
}
