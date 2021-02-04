import {Registration, RegistrationStore} from '../src/registration';
import {Crawler} from '../src/crawler';
import {DatasetStore} from '../src/dataset';
import DatasetExt from 'rdf-ext/lib/Dataset';
import {Validator} from '../src/validator';
import DatasetCore from '@rdfjs/dataset/DatasetCore';
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

    const validator: Validator = {
      async validate(datasets: DatasetCore[]): Promise<DatasetCore | null> {
        return Promise.resolve(null);
      },
    };

    const crawler = new Crawler(registrationStore, datasetStore, validator);
    crawler.crawl(new Date());

    // TODO: add assertions.
  });
});
