// import { applyAction, clone, destroy, getEnv, getSnapshot, onAction } from 'mobx-state-tree';
import { applyAction, clone, destroy, getSnapshot, onAction } from 'mobx-state-tree';
import { Attribute, IAttributeSnapshot } from './attribute';
import { addAttributeToDataSet, addCasesToDataSet, CaseID, ICaseID, ICase, 
          DataSet, IDataSet, IInputCase } from './data-manager';
import * as uuid from 'uuid/v4';

test('Data Manager CaseID functionality', () => {
  const caseID = CaseID.create({ __id__: 0 });
  expect(caseID.__id__).toBeDefined();

  let copy = clone(caseID);
  expect(copy.__id__).toBe(caseID.__id__);
});

test('Data Manager Attribute functionality', () => {
  let attribute = Attribute.create({ name: 'foo' });
  expect(attribute.id).toBeDefined();
  expect(attribute.name).toBe('foo');
  expect(attribute.length).toBe(0);

  let copy = clone(attribute);
  expect(copy.id).toBe(attribute.id);
  expect(copy.name).toBe(attribute.name);

  attribute.setName('bar');
  expect(attribute.name).toBe('bar');

  attribute.setUnits('m');
  expect(attribute.units).toBe('m');

  attribute.addValue(1);
  expect(attribute.length).toBe(1);
  expect(attribute.value(0)).toBe(1);
  
  attribute.addValues([2, 3]);
  expect(attribute.length).toBe(3);
  expect(attribute.value(1)).toBe(2);
  expect(attribute.value(2)).toBe(3);

  attribute.addValue(0, 0);
  expect(attribute.length).toBe(4);
  expect(attribute.value(0)).toBe(0);
  expect(attribute.value(3)).toBe(3);

  attribute.addValues([-2, -1], 0);
  expect(attribute.length).toBe(6);
  expect(attribute.value(0)).toBe(-2);
  expect(attribute.value(5)).toBe(3);

  attribute.setValue(2, 3);
  expect(attribute.value(2)).toBe(3);
  attribute.setValue(10, 10);
  
  attribute.setValues([0, 1], [1, 2]);
  expect(attribute.value(0)).toBe(1);
  expect(attribute.value(1)).toBe(2);
  attribute.setValues([10, 11], [10, 11]);
  
  attribute.setValues([0, 1], [0]);
  expect(attribute.value(0)).toBe(0);
  expect(attribute.value(1)).toBe(2);

  attribute.removeValues(2);
  expect(attribute.length).toBe(5);
  expect(attribute.value(2)).toBe(1);

  attribute.removeValues(0, 2);
  expect(attribute.length).toBe(3);
  expect(attribute.value(0)).toBe(1);
  attribute.removeValues(0, 0);
  expect(attribute.length).toBe(3);
  expect(attribute.value(0)).toBe(1);

  let bar = Attribute.create({ name: 'bar', values: [0, 1, 2] });
  expect(bar.name).toBe('bar');
  expect(bar.length).toBe(3);

  let bazSnap: IAttributeSnapshot = bar.derive('baz');
  expect(bazSnap.id).toBe(bar.id);
  expect(bazSnap.name).toBe('baz');
  expect(bazSnap.values.length).toBe(0);
});

test('Data Manager DataSet functionality', () => {
  const dataset = DataSet.create({ name: 'data' });
  expect(dataset.id).toBeDefined();

  let copy = clone(dataset);
  expect(copy.id).toBe(dataset.id);
  expect(copy.name).toBe(dataset.name);

  // add numeric attribute
  addAttributeToDataSet(dataset, { name: 'num' });
  let numAttr = dataset.attrFromName('num');
  const numAttrID = dataset.attributes[0].id;
  expect(dataset.attributes.length).toBe(1);
  expect(numAttr && numAttr.id).toBe(numAttrID);
  expect(dataset.attributes[0].length).toBe(0);

  // add string attribute before numeric attribute
  addAttributeToDataSet(dataset, { name: 'str' }, numAttrID);
  let strAttr = dataset.attrFromName('str');
  const strAttrID = dataset.attributes[0].id;
  expect(dataset.attributes.length).toBe(2);
  expect(strAttr && strAttr.id).toBe(strAttrID);
  expect(dataset.attributes[0].length).toBe(0);
  expect(dataset.attributes[0].name).toBe('str');
  expect(dataset.attributes[1].name).toBe('num');

  // add/remove attribute
  addAttributeToDataSet(dataset, { id: uuid(), name: 'redShirt' }, numAttrID);
  const redShirtID = dataset.attributes[1].id;
  expect(dataset.attributes.length).toBe(3);
  let redShirt = dataset.attrFromID(redShirtID);
  expect(redShirt.name).toBe('redShirt');
  dataset.removeAttribute(redShirtID);
  expect(dataset.attributes.length).toBe(2);
  expect(dataset.attrFromID(redShirtID)).toBeUndefined();
  expect(dataset.attrFromName('redShirt')).toBeUndefined();
  // removing a non-existent attribute is a no-op
  dataset.removeAttribute('');
  expect(dataset.attributes.length).toBe(2);
  
  // move first attribute to the end
  dataset.moveAttribute(strAttrID as string);
  expect(dataset.attributes[0].name).toBe('num');
  expect(dataset.attributes[1].name).toBe('str');
  // move second attribute before the first
  dataset.moveAttribute(strAttrID, numAttrID);
  expect(dataset.attributes[0].name).toBe('str');
  expect(dataset.attributes[1].name).toBe('num');
  strAttr = dataset.attrFromName('str');
  expect(strAttr && strAttr.id).toBe(strAttrID);
  // moving a non-existent attribute is a no-op
  dataset.moveAttribute('');
  expect(dataset.attributes[0].name).toBe('str');
  expect(dataset.attributes[1].name).toBe('num');

  expect(dataset.getCase('')).toBeUndefined();
  dataset.setCaseValues([{ __id__: '' }]);

  // should ignore if id not specified
  dataset.addCasesWithIDs([{ str: 'd', num: 4 }]);
  expect(dataset.cases.length).toBe(0);

  // add new case
  addCasesToDataSet(dataset, [{ str: 'd', num: 4 }]);
  const caseD4ID = dataset.cases[0].__id__;
  expect(dataset.getCaseAtIndex(-1)).toBeUndefined();
  expect(dataset.getCaseAtIndex(0)).toEqual({ __id__: caseD4ID, str: 'd', num: 4 });
  expect(dataset.getCase(caseD4ID)).toEqual({ __id__: caseD4ID, str: 'd', num: 4 });
  expect(dataset.cases.length).toBe(1);
  expect(caseD4ID).toBeDefined();
  expect(dataset.attributes[0].value(0)).toBe('d');
  expect(dataset.attributes[1].value(0)).toBe(4);

  // add new case before first case
  addCasesToDataSet(dataset, [{ str: 'c', num: 3 }], caseD4ID);
  const caseC3ID = dataset.cases[0].__id__;
  expect(dataset.cases.length).toBe(2);
  expect(caseC3ID).toBeDefined();
  expect(caseC3ID).not.toBe(caseD4ID);
  expect(dataset.nextCaseID('')).toBeUndefined();
  expect(dataset.nextCaseID(caseC3ID)).toBe(caseD4ID);
  expect(dataset.cases[1].__id__).toBe(caseD4ID);
  expect(dataset.attributes[0].value(0)).toBe('c');
  expect(dataset.attributes[1].value(0)).toBe(3);

  // add multiple new cases
  addCasesToDataSet(dataset, [{ str: 'a', num: 1 }, { str: 'b', num: 2 }], caseC3ID);
  const caseA1ID = dataset.cases[0].__id__,
        caseB2ID = dataset.cases[1].__id__;
  expect(dataset.cases.length).toBe(4);
  expect(dataset.attributes[0].value(0)).toBe('a');
  expect(dataset.attributes[1].value(0)).toBe(1);
  expect(dataset.attributes[0].value(1)).toBe('b');
  expect(dataset.attributes[1].value(1)).toBe(2);
  expect(dataset.getCase(caseA1ID)).toEqual({ __id__: caseA1ID, str: 'a', num: 1 });
  expect(dataset.getCase(caseB2ID)).toEqual({ __id__: caseB2ID, str: 'b', num: 2 });
  expect(dataset.getCanonicalCase(caseA1ID))
    .toEqual({ __id__: caseA1ID, [strAttrID]: 'a', [numAttrID]: 1 });
  expect(dataset.getCanonicalCase(caseB2ID))
    .toEqual({ __id__: caseB2ID, [strAttrID]: 'b', [numAttrID]: 2 });
  expect(dataset.getCanonicalCases([caseA1ID, caseB2ID]))
    .toEqual([{ __id__: caseA1ID, [strAttrID]: 'a', [numAttrID]: 1 },
              { __id__: caseB2ID, [strAttrID]: 'b', [numAttrID]: 2 }]);
  // add null/undefined values
  addCasesToDataSet(dataset, [{ str: undefined }]);
  const nullCaseID = dataset.cases[dataset.cases.length - 1].__id__;
  expect(dataset.getCase(nullCaseID))
    .toEqual({ __id__: nullCaseID, str: undefined, num: undefined });
  expect(dataset.getCanonicalCases([''])).toEqual([]);
  // validate that caseIDMap is correct
  dataset.cases.forEach((aCase: ICaseID) => {
    const caseIndex = dataset.caseIndexFromID(aCase.__id__);
    expect((caseIndex >= 0) ? dataset.cases[caseIndex].__id__ : '').toBe(aCase.__id__);
  });

  // setCaseValues
  dataset.setCaseValues([{ __id__: caseA1ID, str: 'A', num: 10 }]);
  expect(dataset.getCase(caseA1ID)).toEqual({ __id__: caseA1ID, str: 'A', num: 10 });
  dataset.setCaseValues([{ __id__: caseB2ID, str: 'B', num: 20 },
                          { __id__: caseC3ID, str: 'C', num: 30 }]);
  expect(dataset.getCase(caseB2ID)).toEqual({ __id__: caseB2ID, str: 'B', num: 20 });
  expect(dataset.getValue(caseC3ID, strAttrID)).toBe('C');
  expect(dataset.getValue(caseC3ID, numAttrID)).toBe(30);
  dataset.setCaseValues([{ __id__: caseA1ID, foo: 'bar' }]);
  expect(dataset.getCase(caseA1ID)).toEqual({ __id__: caseA1ID, str: 'A', num: 10 });
  dataset.setCaseValues([{ __id__: caseA1ID, num: null }]);
  expect(dataset.getCase(caseA1ID)).toEqual({ __id__: caseA1ID, str: 'A', num: undefined });

  const cases = dataset.getCases([caseB2ID, caseC3ID, '']);
  expect(cases.length).toBe(2);
  expect(cases[0]).toEqual({ __id__: caseB2ID, str: 'B', num: 20 });
  expect(cases[1]).toEqual({ __id__: caseC3ID, str: 'C', num: 30 });

  dataset.removeCases([nullCaseID]);
  expect(dataset.cases.length).toBe(4);
  dataset.removeCases([caseA1ID, caseB2ID]);
  expect(dataset.cases.length).toBe(2);
  // validate that caseIDMap is correct
  dataset.cases.forEach((aCase: ICaseID) => {
    const caseIndex = dataset.caseIndexFromID(aCase.__id__);
    expect((caseIndex >= 0) ? dataset.cases[caseIndex].__id__ : '').toBe(aCase.__id__);
  });
  dataset.removeCases(['']);
  expect(dataset.cases.length).toBe(2);
  destroy(dataset);
});

test('Data Manager derived DataSet functionality', () => {
  const dataset = DataSet.create({ name: 'data' });

  // add attributes and cases
  addAttributeToDataSet(dataset, { name: 'str' });
  addAttributeToDataSet(dataset, { name: 'num' });
  const strAttrID = dataset.attributes[0].id;
  addCasesToDataSet(dataset, [{ str: 'a', num: 1 },
                              { str: 'b', num: 2 },
                              { str: 'c', num: 3 }]);

  const derived = dataset.derive('derived');
  expect(derived.name).toBe('derived');
  expect(derived.attributes.length).toBe(2);
  expect(derived.cases.length).toBe(3);
  const derivedCase0ID = derived.cases[0].__id__,
        derivedCase1ID = derived.cases[1].__id__,
        derivedCases = derived.getCases([derivedCase0ID, derivedCase1ID]);
  expect(derivedCases[0]).toEqual({ __id__: derivedCase0ID, str: 'a', num: 1 });
  expect(derivedCases[1]).toEqual({ __id__: derivedCase1ID, str: 'b', num: 2 });
  
  const derived2 = dataset.derive('derived2', { attributeIDs: [strAttrID, ''] });
  expect(derived2.name).toBe('derived2');
  expect(derived2.attributes.length).toBe(1);
  expect(derived.cases.length).toBe(3);
  const derived2Case0ID = derived2.cases[0].__id__,
        derived2Case1ID = derived2.cases[1].__id__,
        derived2Cases = derived2.getCases([derived2Case0ID, derived2Case1ID]);
  expect(derived2Cases[0]).toEqual({ __id__: derived2Case0ID, str: 'a' });
  expect(derived2Cases[1]).toEqual({ __id__: derived2Case1ID, str: 'b' });
  
  const filter = (aCase: ICase) => {
          const num = aCase && aCase.num;
          return (num != null) && (num >= 3) ? aCase : null;
        },
        derived3 = dataset.derive('derived3', { filter });
  expect(derived3.name).toBe('derived3');
  expect(derived3.attributes.length).toBe(2);
  expect(derived3.cases.length).toBe(1);
  const derived3Case0ID = derived3.cases[0].__id__,
        derived3Cases = derived3.getCases([derived3Case0ID]);
  expect(derived3Cases[0]).toEqual({ __id__: derived3Case0ID, str: 'c', num: 3 });
  
  const derived4 = dataset.derive();
  expect(derived4.name).toBe('data');
});

function createDataSet(name: string) {
  const ds = DataSet.create({ name });
  // add attributes and cases
  addAttributeToDataSet(ds, { name: 'str' });
  addAttributeToDataSet(ds, { name: 'num' });
  addCasesToDataSet(ds, [ { str: 'a', num: 1 },
                          { str: 'b', num: 2 },
                          { str: 'c', num: 3 },
                          { str: 'd', num: 4 },
                          { str: 'e', num: 5 }]);
  return ds;
}

function createOdds(source: IDataSet) {
  const numAttr = source.attrFromName('num'),
        numAttrID = numAttr && numAttr.id || '';
  return source.derive('odds', {
                        attributeIDs: [numAttrID],
                        filter: (aCase: ICase) => {
                          const num: number = Number(aCase && aCase.num) || 0;
                          return num % 2 ? aCase : null;
                        },
                        synchronize: true
                      });
}

function createEvens(source: IDataSet) {
  return source.derive('evens', {
                        filter: (aCase: ICase) => {
                          const num: number = Number(aCase && aCase.num) || 0;
                          return num % 2 === 0 ? aCase : null;
                        },
                        synchronize: true
                      });
}

test('Data Manager derived DataSet synchronization (subset attributes)', () => {
  const source = createDataSet('source'),
        odds = createOdds(source);

  expect(odds.attributes.length).toBe(1);

  const bCaseID = source.cases[1].__id__,
        cCaseID = source.cases[2].__id__,
        dCaseID = source.cases[3].__id__,
        eCaseID = source.cases[4].__id__;
  let fooAttrID: string,
      abCaseID: string,
      cdCaseID: string,
      gCaseID: string;
  addAttributeToDataSet(source, { name: 'foo' });
  fooAttrID = source.attributes[2].id;

  return odds.onSynchronized()
    .then(() => {
      expect(odds.isSynchronizing).toBe(false);
      expect(odds.attributes.length).toBe(1);

      source.removeAttribute(fooAttrID);
      return odds.onSynchronized();
    })
    .then(() => {
      expect(odds.attributes.length).toBe(1);

      addCasesToDataSet(source, [{ str: 'f', num: 6 }, { str: 'g', num: 7 }]);
      gCaseID = source.cases[6].__id__;
      return odds.onSynchronized();
    })
    .then(() => {
      expect(odds.cases.length).toBe(4);
      expect(odds.getCase(gCaseID)).toEqual({ __id__: gCaseID, num: 7 });

      addCasesToDataSet(source, [{ str: 'ab', num: -3 }, { str: 'cd', num: -1 }], [bCaseID, dCaseID]);
      abCaseID = source.cases[1].__id__;
      expect(source.getCase(abCaseID)).toEqual({ __id__: abCaseID, str: 'ab', num: -3 });
      cdCaseID = source.cases[4].__id__;
      expect(source.getCase(cdCaseID)).toEqual({ __id__: cdCaseID, str: 'cd', num: -1 });
      return odds.onSynchronized();
    })
    .then(() => {
      expect(odds.cases.length).toBe(6);
      expect(odds.getCase(abCaseID)).toEqual({ __id__: abCaseID, num: -3 });
      expect(odds.nextCaseID(abCaseID)).toBe(cCaseID);
      expect(odds.getCase(cdCaseID)).toEqual({ __id__: cdCaseID, num: -1 });
      expect(odds.nextCaseID(cdCaseID)).toBe(eCaseID);
      // setCaseValues: changing odd value to even should result in removing case
      source.setCaseValues([{ __id__: cCaseID, num: 2 }]);
      return odds.onSynchronized();
    })
    .then(() => {
      expect(odds.cases.length).toBe(5);
      source.setCaseValues([{ __id__: cCaseID, num: 3 }]);
      return odds.onSynchronized();
    })
    .then(() => {
      expect(odds.cases.length).toBe(6);
      expect(odds.nextCaseID(cCaseID)).toBe(cdCaseID);
      source.setCaseValues([{ __id__: bCaseID, num: 3 }, { __id__: dCaseID, num: 5 }]);
      return odds.onSynchronized();
    })
    .then(() => {
      expect(odds.cases.length).toBe(8);
      expect(odds.nextCaseID(bCaseID)).toBe(cCaseID);
      expect(odds.nextCaseID(dCaseID)).toBe(eCaseID);
      return odds.onSynchronized();
    })
    .then(() => {
      // test destruction
      destroy(odds);
    });
});

test('Data Manager derived DataSet synchronization (all attributes)', () => {
  const source = createDataSet('source'),
        evens = createEvens(source),
        bCaseID = evens.cases[1].__id__;

  expect(evens.attributes.length).toBe(2);

  let fooAttrID: string, a1CaseID: string, a2CaseID;
  addAttributeToDataSet(source, { name: 'foo' });
  fooAttrID = source.attributes[2].id;

  return evens.onSynchronized()
    .then(() => {
      expect(evens.isSynchronizing).toBe(false);
      expect(evens.attributes.length).toBe(3);

      source.removeAttribute(fooAttrID);
      return evens.onSynchronized();
    })
    .then(() => {
      expect(evens.attributes.length).toBe(2);

      addCasesToDataSet(source, [{ str: 'a1', num: -4 }, { str: 'a2', num: -2 }], bCaseID);
      return evens.onSynchronized();
    })
    .then(() => {
      expect(evens.cases.length).toBe(4);
      a1CaseID = evens.cases[1].__id__;
      a2CaseID = evens.cases[2].__id__;
      expect(evens.getCase(a1CaseID)).toEqual({ __id__: a1CaseID, str: 'a1', num: -4 });
      expect(evens.nextCaseID(a1CaseID)).toBe(a2CaseID);
      expect(evens.getCase(a2CaseID)).toEqual({ __id__: a2CaseID, str: 'a2', num: -2 });
      expect(evens.nextCaseID(a2CaseID)).toBe(bCaseID);
      return evens.onSynchronized();
    })
    .then(() => {
      // text invalid addCasesWithIDs
      source.addCasesWithIDs((function(): ICase[] | undefined { return undefined; })() as ICase[]);
      // test invalid setCaseValues handling
      source.setCaseValues((function(): IInputCase[] | undefined { return undefined; })() as IInputCase[]);
      // test invalid setCaseValues handling
      source.setCaseValues([{} as IInputCase]);
      // test multiple setCaseValues
      source.setCaseValues([{ __id__: a1CaseID, num: -3 }]);
      source.setCaseValues([{ __id__: a1CaseID, num: -2 }]);
      return evens.onSynchronized();
    })
    .then(() => {
      // test destruction
      destroy(evens);
    });
});

test('Data Manager derived DataSet synchronization (no filter)', () => {
  const source = createDataSet('source'),
        derived = source.derive('derived', { synchronize: true });
  
  addCasesToDataSet(source, [{ str: 'g', num: 7 }]);
  expect(source.cases.length).toBe(6);
  let fCaseID: string;
  const gCaseID = source.cases[5].__id__;
  derived.onSynchronized()
    .then(() => {
      expect(derived.cases.length).toBe(6);
      expect(derived.getCase(gCaseID)).toEqual({ __id__: gCaseID, str: 'g', num: 7 });
      addCasesToDataSet(source, [{ str: 'f', num: 7 }], gCaseID);
      fCaseID = source.cases[5].__id__;
      return derived.onSynchronized();
    })
    .then(() => {
      expect(derived.cases.length).toBe(7);
      expect(derived.getCaseAtIndex(5)).toEqual({ __id__: fCaseID, str: 'f', num: 7 });
      source.setCaseValues([{ __id__: fCaseID, num: 6 }]);
      return derived.onSynchronized();
    })
    .then(() => {
      expect(derived.getCase(fCaseID)).toEqual({ __id__: fCaseID, str: 'f', num: 6 });
      destroy(derived);
    });
});

test('Data Manager DataSet synchronization functionality', (done) => {
  const src = DataSet.create({ name: 'source' }),
        dst = clone(src),
        dst2 = clone(dst);
  let srcActionCount = 0,
      dstActionCount = 0;
  // keep dst in sync with src
  onAction(src, (action) => {
    ++srcActionCount;
    // console.log(`onSrcAction [pre]: count: ${srcActionCount}, action: ${JSON.stringify(action)}`);
    // have to use setTimeout otherwise subsequent actions don't trigger
    // perhaps the code that suppresses actions within actions
    setTimeout(() => {
      --srcActionCount;
      // console.log(`onSrcAction [run]: count: ${srcActionCount}, action: ${JSON.stringify(action)}`);
      applyAction(dst, action);
      expect(getSnapshot(dst)).toEqual(getSnapshot(src));
      if ((srcActionCount <= 0) && (dstActionCount <= 0)) {
        done();
      }
    });
  });
  // keep dst2 in sync with dst
  onAction(dst, (action) => {
    ++dstActionCount;
    // console.log(`onDstAction [pre]: count: ${dstActionCount}, action: ${JSON.stringify(action)}`);
    setTimeout(() => {
      --dstActionCount;
      // console.log(`onDstAction [run]: count: ${dstActionCount}, action: ${JSON.stringify(action)}`);
      applyAction(dst2, action);
      expect(getSnapshot(dst2)).toEqual(getSnapshot(dst));
      if ((srcActionCount <= 0) && (dstActionCount <= 0)) {
        done();
      }
    });
  });

  addAttributeToDataSet(src, { name: 'str' });
  addAttributeToDataSet(src, { name: 'num' });
  addCasesToDataSet(src, [{ str: 'a', num: 1 }]);
  addCasesToDataSet(src, [{ str: 'b', num: 2 }, { str: 'c', num: 3 }]);
  src.removeAttribute(src.attributes[0].id);
});
