import {Registration, RegistrationStore} from '../src/registration';
import {Crawler} from '../src/crawler';
import {DatasetStore} from '../src/dataset';
import DatasetExt from 'rdf-ext/lib/Dataset';
import {Dataset} from 'rdf-js';

describe('Crawler', () => {
  it('crawls URLs', () => {
    const registrations: Registration[] = [];
    const registrationStore: RegistrationStore = {
      findRegistrationsReadBefore(): Promise<Registration[]> {
        return Promise.resolve([]);
      },
      store(registration: Registration): void {
        registrations.push(registration);
      },
    };

    const datasets: Dataset[] = [];
    const datasetStore: DatasetStore = {
      store(datasets: DatasetExt[]): void {
        datasets.push(...datasets);
      },
    };

    const crawler = new Crawler(registrationStore, datasetStore);
    crawler.crawl(new Date());

    // TODO: add assertions.
  });
});
