import { addMiddleware, applyAction, getEnv, onAction, types, getSnapshot } from 'mobx-state-tree';
import { ISerializedActionCall } from 'mobx-state-tree/dist/middlewares/on-action';
import { Attribute, IAttribute, IAttributeSnapshot, IValueType } from './attribute';
// see https://medium.com/@martin_hotell/tree-shake-lodash-with-webpack-jest-and-typescript-2734fa13b5cd
// for more efficient ways of importing lodash functions
import { cloneDeep, findIndex } from 'lodash';

export const localId = () => {
  return Date.now().toString();
};

export const CaseID = types.model('CaseID', {
  __id__: types.identifier(types.string)
  // __index__: types.number
}).preProcessSnapshot((snapshot) => {
  const { __id__, ...others } = snapshot;
  return { __id__: __id__ || localId(), ...others };
});
export type ICaseID = typeof CaseID.Type;

export interface ICase {
  __id__?: string;
  [key: string]: IValueType;
}
export type ICaseFilter = (aCase: ICase) => ICase | null | undefined;

export interface IDerivationSpec {
  attributeIDs?: string[] | null;
  filter?: ICaseFilter | null;
  synchronize?: boolean;
}

interface IEnvContext {
  srcDataSet: IDataSet;
  derivationSpec: IDerivationSpec;
}

export interface IInputCase {
  __id__: string;
  [key: string]: IValueType | null;
}

export const DataSet = types.model('DataSet', {
  id: types.identifier(types.string),
  sourceID: types.maybe(types.string),
  name: types.string,
  attributes: types.optional(types.array(Attribute), []),
  cases: types.optional(types.array(CaseID), [])
}).preProcessSnapshot((snapshot) => {
  const { id, ...others } = snapshot;
  return { id: id || localId(), ...others };
}).volatile(self => ({
  transactionCount: 0
})).extend(self => {
  let attrIDMap: { [index: string]: IAttribute } = {},
      // map from attribute names to attribute IDs
      attrNameMap: { [index: string]: string } = {},
      // map from case IDs to indices
      caseIDMap: { [index: string]: number } = {},
      inFlightActions = 0,
      disposers: { [index: string]: () => void } = {};

  function derive(name?: string) {
    return { sourceID: self.id, name: name || self.name, attributes: [], cases: [] };
  }

  function attrIndexFromID(id: string) {
    for (let i = 0; i < self.attributes.length; ++i) {
      if (self.attributes[i].id === id) {
        return i;
      }
    }
    return undefined;
  }

  function mapBeforeID(srcDataSet?: IDataSet, beforeID?: string) {
    let id: string | undefined = beforeID;
    while (id && (caseIDMap[id] == null)) {
      id = srcDataSet && srcDataSet.nextCaseID(id);
    }
    return id && caseIDMap[id] ? id : undefined;
  }

  function mapBeforeIDArg(beforeID?: string | string[]) {
    const context: IEnvContext = getEnv(self),
          { srcDataSet } = context;
    if (Array.isArray(beforeID)) {
      return beforeID.map((id) => mapBeforeID(srcDataSet, id));
    }
    else {
      return mapBeforeID(srcDataSet, beforeID);
    }
  }

  function getCase(caseID: string): ICase | undefined {
    const index = caseIDMap[caseID];
    if (index == null) { return undefined; }

    let aCase: ICase = { __id__: caseID };
    self.attributes.forEach((attr) => {
      aCase[attr.name] = attr.value(index);
    });
    return aCase;
  }

  function getCaseAtIndex(index: number) {
    const aCase = self.cases[index],
          id = aCase && aCase.__id__;
    return id ? getCase(id) : undefined;
  }

  function getCanonicalCase(caseID: string): ICase | undefined {
    const index = caseIDMap[caseID];
    if (index == null) { return undefined; }

    let aCase: ICase = { __id__: caseID };
    self.attributes.forEach((attr) => {
      aCase[attr.id] = attr.value(index);
    });
    return aCase;
  }

  function getCanonicalCaseAtIndex(index: number) {
    const aCase = self.cases[index],
          id = aCase && aCase.__id__;
    return id ? getCanonicalCase(id) : undefined;
  }

  function beforeIndexForInsert(index: number, beforeID?: string | string[]) {
    if (!beforeID) { return self.cases.length; }
    return Array.isArray(beforeID)
            ? caseIDMap[beforeID[index]]
            : caseIDMap[beforeID];
  }

  function insertCaseIDAtIndex(id: string, beforeIndex: number) {
    // const newCase = { __id__: id, __index__: beforeIndex };
    const newCase = { __id__: id };
    if ((beforeIndex != null) && (beforeIndex < self.cases.length)) {
      self.cases.splice(beforeIndex, 0, newCase );
      // increment indices of all subsequent cases
      for (let i = beforeIndex + 1; i < self.cases.length; ++i) {
        const aCase = self.cases[i];
        ++caseIDMap[aCase.__id__];
        // aCase.__index__ = i;
      }
    }
    else {
      self.cases.push(newCase);
      beforeIndex = self.cases.length - 1;
    }
    caseIDMap[self.cases[beforeIndex].__id__] = beforeIndex;
  }

  function setCaseValues(caseValues: IInputCase) {
    const index = caseIDMap[caseValues.__id__];
    if (index == null) { return; }

    for (let key in caseValues) {
      if (key !== '__id__') {
        const attributeID = attrNameMap[key],
              attribute = attrIDMap[attributeID];
        if (attribute) {
          const value = caseValues[key];
          attribute.setValue(index, value != null ? value : undefined);
        }
      }
    }
  }

  function setCanonicalCaseValues(caseValues: IInputCase) {
    const index = caseIDMap[caseValues.__id__];
    if (index == null) { return; }

    for (let key in caseValues) {
      if (key !== '__id__') {
        const attributeID = key,
              attribute = attrIDMap[attributeID];
        if (attribute) {
          const value = caseValues[key];
          attribute.setValue(index, value != null ? value : undefined);
        }
      }
    }
  }

  function delayApplyActions(actions: ISerializedActionCall[]) {
    ++inFlightActions;
    setTimeout(() => {
      if (--inFlightActions <= 0) {
        applyAction(self, actions);
      }
    });
  }

  return {
    views: {
      attrFromID(id: string) {
        return attrIDMap[id];
      },
      attrFromName(name: string) {
        const id = attrNameMap[name];
        return id ? attrIDMap[id] : undefined;
      },
      attrIndexFromID(id: string) {
        return findIndex(self.attributes, (attr) => attr.id === id );
      },
      caseIndexFromID(id: string) {
        return caseIDMap[id];
      },
      nextCaseID(id: string) {
        const index = caseIDMap[id],
              nextCase = (index != null) && (index < self.cases.length - 1)
                          ? self.cases[index + 1] : undefined;
        return nextCase ? nextCase.__id__ : undefined;
      },
      getValue(caseID: string, attributeID: string) {
        const attr = attrIDMap[attributeID],
              index = caseIDMap[caseID];
        return attr && (index != null) ? attr.value(index) : undefined;
      },
      getCase(caseID: string): ICase | undefined {
        return getCase(caseID);
      },
      getCases(caseIDs: string[]): ICase[] {
        let cases: ICase[] = [];
        caseIDs.forEach((caseID) => {
          const aCase = getCase(caseID);
          if (aCase) {
            cases.push(aCase);
          }
        });
        return cases;
      },
      getCaseAtIndex(index: number) {
        return getCaseAtIndex(index);
      },
      getCasesAtIndices(start: number = 0, count?: number) {
        const endIndex = count != null
                          ? Math.min(start + count, self.cases.length)
                          : self.cases.length,
              cases = [];
        for (let i = start; i < endIndex; ++i) {
          const aCase = getCaseAtIndex(i);
          if (aCase) { cases.push(aCase); }
        }
        return cases;
      },
      getCanonicalCase(caseID: string): ICase | undefined {
        return getCanonicalCase(caseID);
      },
      getCanonicalCases(caseIDs: string[]): ICase[] {
        let cases: ICase[] = [];
        caseIDs.forEach((caseID) => {
          const aCase = getCanonicalCase(caseID);
          if (aCase) {
            cases.push(aCase);
          }
        });
        return cases;
      },
      getCanonicalCaseAtIndex(index: number) {
        return getCanonicalCaseAtIndex(index);
      },
      getCanonicalCasesAtIndices(start: number = 0, count?: number) {
        const endIndex = count != null
                          ? Math.min(start + count, self.cases.length)
                          : self.cases.length,
              cases = [];
        for (let i = start; i < endIndex; ++i) {
          const aCase = getCanonicalCaseAtIndex(i);
          if (aCase) { cases.push(aCase); }
        }
        return cases;
      },
      get isInTransaction() {
        return self.transactionCount > 0;
      },
      get isSynchronizing() {
        return inFlightActions > 0;
      },
      onSynchronized() {
        if (inFlightActions <= 0) {
          return Promise.resolve(self);
        }
        return new Promise((resolve, reject) => {
          function waitForSync() {
            if (inFlightActions <= 0) {
              resolve(self);
            }
            else {
              setTimeout(waitForSync);
            }
          }
          waitForSync();
        });
      },
      derive(name?: string, derivationSpec?: IDerivationSpec) {
        const context = { srcDataSet: self, derivationSpec };
        let derived = DataSet.create(derive(name), context);
        const attrIDs = derivationSpec && derivationSpec.attributeIDs ||
                          self.attributes.map(attr => attr.id),
              filter = derivationSpec && derivationSpec.filter;
        attrIDs.forEach((attrID) => {
          const attribute = attrIDMap[attrID];
          if (attribute) {
            addAttributeToDataSet(derived, attribute.derive());
          }
        });
        self.cases.forEach((aCaseID) => {
          const inCase = getCase(aCaseID.__id__),
                outCase = filter && inCase ? filter(inCase) : inCase;
          if (outCase) {
            addCasesToDataSet(derived, [outCase]);
          }
        });
        return derived;
      }
    },
    actions: {
      afterCreate() {
        const context: IEnvContext = getEnv(self),
              { srcDataSet, derivationSpec = {} } = context,
              { attributeIDs, filter, synchronize } = derivationSpec;
        if (srcDataSet && synchronize) {
          disposers.srcDataSetOnAction = onAction(srcDataSet, (action) => {
            let actions = [],
                newAction;
            switch (action.name) {
              case 'addAttributeWithID':
                // ignore new attributes if we have a subset of attributes
                if (!attributeIDs) {
                  actions.push(action);
                }
                break;
              case 'addCasesWithIDs': {
                const addCasesArgs = action.args && action.args.slice(),
                      srcCasesToAdd = addCasesArgs && addCasesArgs[0],
                      // only add new cases if they pass the filter
                      dstCasesToAdd = srcCasesToAdd && filter
                                        ? srcCasesToAdd.filter(filter)
                                        : srcCasesToAdd,
                      srcBeforeID = addCasesArgs && addCasesArgs[1],
                      // map beforeIDs from src to dst
                      dstBeforeID = srcBeforeID && mapBeforeIDArg(srcBeforeID),
                      // adjust arguments for the updated action
                      dstCasesArgs = [dstCasesToAdd, dstBeforeID];
                // only add the new cases if they pass our filter
                if (addCasesArgs && dstCasesToAdd && dstCasesToAdd.length) {
                  newAction = { name: action.name, path: '', args: dstCasesArgs };
                  actions.push(newAction);
                }
                break;
              }
              case 'setCaseValues':
              case 'setCanonicalCaseValues': {
                const setValuesArgs = action.args && action.args.slice(),
                      actionCases = setValuesArgs && setValuesArgs[0],
                      casesToAdd: ICase[] = [],
                      beforeIDs: (string | undefined)[] = [],
                      casesToRemove: string[] = [];
                let isValidAction = !!(actionCases && actionCases.length);
                (actionCases || []).forEach((aCase: ICase) => {
                  const caseID = aCase.__id__;
                  let srcCase = srcDataSet && caseID && srcDataSet.getCase(caseID);
                  if (caseID && srcCase) {
                    const filteredCase = filter ? filter(srcCase) : srcCase,
                          doesInclude = caseIDMap[caseID] != null;
                    // identify cases that now pass the filter after change
                    if (filteredCase && !doesInclude) {
                      casesToAdd.push(filteredCase);
                      // determine beforeIDs so that cases end up in correct locations
                      const srcBeforeID = srcDataSet && srcDataSet.nextCaseID(caseID),
                            dstBeforeID = mapBeforeID(srcDataSet, srcBeforeID);
                      beforeIDs.push(dstBeforeID);
                    }
                    // identify cases that no longer pass the filter after change
                    if (!filteredCase && doesInclude) {
                      casesToRemove.push(caseID);
                    }
                  }
                  else {
                    isValidAction = false;
                  }
                });
                // modify existing cases
                if (isValidAction) {
                  actions.push(action);
                }
                // add cases that now pass the filter
                if (casesToAdd && casesToAdd.length) {
                  actions.push({ name: 'addCasesWithIDs', path: '', args: [casesToAdd, beforeIDs] });
                }
                // remove cases that no longer pass the filter
                if (casesToRemove && casesToRemove.length) {
                  actions.push({ name: 'removeCases', path: '', args: [casesToRemove] });
                }
                break;
              }
              // other actions can be applied as is
              default:
                actions.push(action);
                break;
            }
            if (actions && actions.length) {
              delayApplyActions(actions);
            }
          // attachAfter: if true, listener is called after action has been applied
          }, true); // tslint:disable-line
        }
      },
      beforeDestroy: function() {
        Object.keys(disposers).forEach((key: string) => disposers[key]());
      },
      beginTransaction() {
        ++self.transactionCount;
      },
      endTransaction() {
        --self.transactionCount;
      },
      setName: function(name: string) {
        self.name = name;
      },
      addAttributeWithID(snapshot: IAttributeSnapshot, beforeID?: string) {
        const beforeIndex = beforeID ? attrIndexFromID(beforeID) : undefined;
        let newIndex = beforeIndex;
        if (beforeIndex != null) {
          self.attributes.splice(beforeIndex, 0, snapshot as IAttribute);
        }
        else {
          newIndex = self.attributes.push(snapshot as IAttribute) - 1;
        }
        const attribute = self.attributes[newIndex as number];
        attrIDMap[attribute.id] = attribute;
        attrNameMap[attribute.name] = attribute.id;
        for (let i = attribute.values.length; i < self.cases.length; ++i) {
          attribute.values.push(undefined);
        }
      },

      removeAttribute(attributeID: string) {
        const attrIndex = attrIndexFromID(attributeID),
              attribute = attributeID && attrIDMap[attributeID],
              attrName = attribute && attribute.name;
        if (attrIndex != null) {
          self.attributes.splice(attrIndex, 1);
          delete attrIDMap[attributeID];
          delete attrNameMap[attrName];
        }
      },

      moveAttribute(attributeID: string, beforeID?: string) {
        const srcAttrIndex = attrIndexFromID(attributeID);
        if (srcAttrIndex != null) {
          const snapshot = getSnapshot(self.attributes[srcAttrIndex]);
          self.attributes.splice(srcAttrIndex, 1);
          let dstAttrIndex = beforeID ? attrIndexFromID(beforeID) : undefined;
          if (dstAttrIndex != null) {
            self.attributes.splice(dstAttrIndex, 0, snapshot as IAttribute);
          }
          else {
            self.attributes.push(snapshot as IAttribute);
            dstAttrIndex = self.attributes.length - 1;
          }
          attrIDMap[attributeID] = self.attributes[dstAttrIndex];
        }
      },

      addCasesWithIDs(cases: ICase[], beforeID?: string | string[]) {
        (cases || []).forEach((aCase, index) => {
          if (!aCase || !aCase.__id__) { return; }
          const beforeIndex = beforeIndexForInsert(index, beforeID);
          self.attributes.forEach((attr: IAttribute) => {
            const value = aCase[attr.name];
            attr.addValue(value != null ? value : undefined, beforeIndex);
          });
          insertCaseIDAtIndex(aCase.__id__, beforeIndex);
        });
      },

      addCanonicalCasesWithIDs(cases: ICase[], beforeID?: string | string[]) {
        (cases || []).forEach((aCase, index) => {
          if (!aCase || !aCase.__id__) { return; }
          const beforeIndex = beforeIndexForInsert(index, beforeID);
          self.attributes.forEach((attr: IAttribute) => {
            const value = aCase[attr.id];
            attr.addValue(value != null ? value : undefined, beforeIndex);
          });
          insertCaseIDAtIndex(aCase.__id__, beforeIndex);
        });
      },

      setCaseValues(cases: IInputCase[]) {
        (cases || []).forEach((caseValues) => {
          setCaseValues(caseValues);
        });
      },

      setCanonicalCaseValues(cases: IInputCase[]) {
        (cases || []).forEach((caseValues) => {
          setCanonicalCaseValues(caseValues);
        });
      },

      removeCases(caseIDs: string[]) {
        caseIDs.forEach((caseID) => {
          const index = caseIDMap[caseID];
          if (index != null) {
            self.cases.splice(index, 1);
            self.attributes.forEach((attr) => {
              attr.removeValues(index);
            });
            delete caseIDMap[caseID];
            for (let i = index; i < self.cases.length; ++i) {
              const id = self.cases[i].__id__;
              caseIDMap[id] = i;
            }
          }
        });
      },

      addActionListener(key: string, listener: (action: ISerializedActionCall) => void) {
        if (typeof listener === 'function') {
          disposers[key] = onAction(self, (action) => listener(action), true);
        }
        else {
          console.log(`DataSet.addActionListener called for '${key}' with non-function argument!`);
        }
      },

      removeActionListener(key: string) {
        const disposer = disposers[key];
        if (disposer) {
          delete disposers[key];
          disposer();
        }
      },

      addMiddleware(key: string, handler: (call: {}, next: {}) => void) {
        disposers[key] = addMiddleware(self, handler);
      },

      removeMiddleware(key: string) {
        const disposer = disposers[key];
        if (disposer) {
          delete disposers[key];
          disposer();
        }
      }
    }
  };
});
export type IDataSet = typeof DataSet.Type;
export type IDataSetSnapshot = typeof DataSet.SnapshotType;

export function addAttributeToDataSet(dataset: IDataSet, snapshot: IAttributeSnapshot, beforeID?: string) {
  if (!snapshot.id) {
    snapshot.id = localId();
  }
  dataset.addAttributeWithID(snapshot, beforeID);
}

export function addCasesToDataSet(dataset: IDataSet, cases: ICase[], beforeID?: string | string[]) {
  const newCases = cloneDeep(cases);
  newCases.forEach((aCase) => {
    if (!aCase.__id__) {
      aCase.__id__ = localId();
    }
  });
  dataset.addCasesWithIDs(newCases, beforeID);
}

export function addCanonicalCasesToDataSet(dataset: IDataSet, cases: ICase[], beforeID?: string | string[]) {
  const newCases = cloneDeep(cases);
  newCases.forEach((aCase) => {
    if (!aCase.__id__) {
      aCase.__id__ = localId();
    }
  });
  dataset.addCanonicalCasesWithIDs(newCases, beforeID);
}
