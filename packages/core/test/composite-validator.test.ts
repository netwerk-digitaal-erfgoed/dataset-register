import factory from 'rdf-ext';
import type { Dataset, DatasetCore, Quad } from '@rdfjs/types';
import {
  CompositeValidator,
  InvalidDataset,
  shacl,
  Valid,
  type ValidationTiming,
} from '../src/validator.ts';
import type { DistributionProbeStage } from '../src/distribution-probe/probe.ts';

type ValidationResult = Valid | InvalidDataset | { state: 'no-dataset' };

const emptyDataset = (): Dataset => factory.dataset() as unknown as Dataset;

const fakeShacl = (result: ValidationResult) => ({
  validate: async (_: DatasetCore): Promise<ValidationResult> => result,
});

const fakeProbeStage = (quads: Quad[]) =>
  ({
    run: async (_: DatasetCore): Promise<Quad[]> => quads,
  }) as unknown as DistributionProbeStage;

const violationQuad = (): Quad => {
  const blank = factory.blankNode();
  return factory.quad(blank, shacl('resultSeverity'), shacl('Violation'));
};

const warningQuad = (): Quad => {
  const blank = factory.blankNode();
  return factory.quad(blank, shacl('resultSeverity'), shacl('Warning'));
};

describe('CompositeValidator', () => {
  it('returns the SHACL result unchanged when SHACL fails', async () => {
    const shaclResult: InvalidDataset = {
      state: 'invalid',
      errors: emptyDataset(),
    };
    const probeStage = fakeProbeStage([violationQuad()]);
    let probeCalled = false;
    (probeStage as unknown as { run: (input: DatasetCore) => Promise<Quad[]> }).run =
      async () => {
        probeCalled = true;
        return [];
      };

    const composite = new CompositeValidator(fakeShacl(shaclResult), probeStage);
    const result = await composite.validate(factory.dataset());

    expect(result).toBe(shaclResult);
    expect(probeCalled).toBe(false);
  });

  it('returns the SHACL result unchanged when no probe quads are emitted', async () => {
    const shaclResult: Valid = { state: 'valid', errors: emptyDataset() };
    const composite = new CompositeValidator(
      fakeShacl(shaclResult),
      fakeProbeStage([]),
    );

    const result = await composite.validate(factory.dataset());

    expect(result).toBe(shaclResult);
  });

  it('populates the timing sink with the SHACL phase and forwards it to the probe stage', async () => {
    const shaclResult: Valid = { state: 'valid', errors: emptyDataset() };
    const probeStage = {
      run: async (
        _input: DatasetCore,
        _onProgress: unknown,
        timing?: { networkMs?: number },
      ): Promise<Quad[]> => {
        if (timing) timing.networkMs = 42;
        return [];
      },
    } as unknown as DistributionProbeStage;
    const composite = new CompositeValidator(fakeShacl(shaclResult), probeStage);

    const timing: ValidationTiming = {};
    await composite.validate(factory.dataset(), undefined, timing);

    expect(typeof timing.shaclMs).toBe('number');
    expect(timing.networkMs).toBe(42);
  });

  it('merges probe quads but stays valid when no quad has Violation severity', async () => {
    const shaclResult: Valid = { state: 'valid', errors: emptyDataset() };
    const probeQuads = [warningQuad()];
    const composite = new CompositeValidator(
      fakeShacl(shaclResult),
      fakeProbeStage(probeQuads),
    );

    const result = (await composite.validate(factory.dataset())) as Valid;

    expect(result.state).toBe('valid');
    expect(result.errors.size).toBe(1);
  });

  it('flips to invalid when any probe quad has Violation severity', async () => {
    const shaclResult: Valid = { state: 'valid', errors: emptyDataset() };
    const probeQuads = [warningQuad(), violationQuad()];
    const composite = new CompositeValidator(
      fakeShacl(shaclResult),
      fakeProbeStage(probeQuads),
    );

    const result = (await composite.validate(
      factory.dataset(),
    )) as InvalidDataset;

    expect(result.state).toBe('invalid');
    expect(result.errors.size).toBe(2);
  });
});
