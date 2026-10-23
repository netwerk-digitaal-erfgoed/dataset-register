import { URL } from 'node:url';
import type { DatasetStore } from './dataset.ts';
import type { RatingStore } from './rate.ts';
import type { RegistrationStore } from './registration.ts';
import type { DistributionHealthStore } from './distribution-health-store.ts';
import type { DistributionValidityStore } from './distribution-validity-store.ts';
import { canonicalProbeUrl } from './distribution-probe/probe.ts';

export interface DatasetRemoverStores {
  registrationStore: RegistrationStore;
  datasetStore: DatasetStore;
  ratingStore: RatingStore;
  distributionHealthStore: DistributionHealthStore;
  distributionValidityStore: DistributionValidityStore;
}

/**
 * Removes the datasets that no registration lists any more, with everything the register
 * stores about them: the dataset graph, its rating, and the distribution health and
 * validity records of the URLs no remaining dataset references.
 *
 * A registration’s SHACL validation report is keyed by the registration, not by its
 * datasets, so it is not removed here.
 */
export class DatasetRemover {
  constructor(private readonly stores: DatasetRemoverStores) {}

  /**
   * Remove those of `datasetIris` that no registration other than `registrationUrl` lists:
   * a dataset that two catalogs describe outlives either one dropping it.
   *
   * @returns the datasets that were removed.
   */
  async remove(datasetIris: URL[], registrationUrl?: URL): Promise<URL[]> {
    const unlisted = await this.unlisted(datasetIris, registrationUrl);
    if (unlisted.length === 0) return [];

    const distributionUrls = [
      ...new Set(await this.stores.datasetStore.findDistributionUrls(unlisted)),
    ];

    // Probe records are keyed by URL, so another dataset can still depend on one. They go
    // before the dataset graphs that name their URLs, so a removal that stops halfway is
    // finished by running it again.
    const referenced = new Set(
      (
        await this.stores.datasetStore.findReferencedDistributionUrls(
          distributionUrls.map(withoutFragment),
          unlisted,
        )
      ).flatMap(probeRecordKey),
    );
    const unreferenced = new Set(
      distributionUrls
        .flatMap(probeRecordKey)
        .filter((key) => !referenced.has(key)),
    );
    for (const key of unreferenced) {
      await this.stores.distributionHealthStore.delete(new URL(key));
      await this.stores.distributionValidityStore.delete(new URL(key));
    }

    for (const datasetIri of unlisted) {
      await this.stores.ratingStore.delete(datasetIri);
      await this.stores.datasetStore.delete(datasetIri);
    }

    return unlisted;
  }

  /**
   * Remove every stored dataset that no registration lists. Not safe to run while a
   * registration is being submitted: `POST /datasets` stores the dataset graphs before it
   * lists them on the registration.
   *
   * @returns the datasets that were removed, or would be when `dryRun` is set.
   */
  async removeUnlisted({ dryRun = false } = {}): Promise<URL[]> {
    const datasetIris = await this.stores.datasetStore.findAll();
    return dryRun ? this.unlisted(datasetIris) : this.remove(datasetIris);
  }

  private async unlisted(datasetIris: URL[], exceptUrl?: URL): Promise<URL[]> {
    if (datasetIris.length === 0) return [];

    const listed = new Set(
      (
        await this.stores.registrationStore.findListedDatasets(
          datasetIris,
          exceptUrl,
        )
      ).map((datasetIri) => datasetIri.toString()),
    );
    return datasetIris.filter(
      (datasetIri) => !listed.has(datasetIri.toString()),
    );
  }
}

function withoutFragment(url: string): string {
  return url.split('#')[0]!;
}

/** The URL the probe keys its records by, or none for a URL it cannot probe. */
function probeRecordKey(url: string): string[] {
  return URL.canParse(url) ? [canonicalProbeUrl(new URL(url)).toString()] : [];
}
