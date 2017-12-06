import { applyAction, getEnv, onAction, types, getSnapshot } from 'mobx-state-tree';
import * as uuid from 'uuid/v4';
import { ISerializedActionCall } from 'mobx-state-tree/dist/middlewares/on-action';

export const ValueType = types.union(types.number, types.string, types.undefined);
export type IValueType = number | string | undefined;

export const Attribute = types.model('Attribute', {
  id: types.identifier(types.string),
  sourceID: types.maybe(types.string),
  name: types.string,
  units: types.optional(types.string, ''),
  formula: types.optional(types.string, ''),
  values: types.optional(types.array(ValueType), [])
}).preProcessSnapshot((snapshot) => {
  const { id, ...others } = snapshot;
  return { id: id || uuid(), ...others };
}).views(self => ({
  get length() {
    return self.values.length;
  },
  value(index: number) {
    return self.values[index];
  },
  derive(name?: string) {
    return { sourceID: self.id, name: name || self.name, units: self.units, values: [] };
  }
})).actions(self => ({
  setName(newName: string) {
    self.name = newName;
  },
  setUnits(units: string) {
    self.units = units;
  },
  addValue(value: IValueType, beforeIndex?: number) {
    if ((beforeIndex != null) && (beforeIndex < self.values.length)) {
      self.values.splice(beforeIndex, 0, value);
    }
    else {
      self.values.push(value);
    }
  },
  addValues(values: IValueType[], beforeIndex?: number) {
    if ((beforeIndex != null) && (beforeIndex < self.values.length)) {
      self.values.splice.apply(self.values, [beforeIndex, 0, ...values]);
    }
    else {
      self.values.push.apply(self.values, values);
    }
  },
  setValue(index: number, value: IValueType) {
    if ((index >= 0) && (index < self.values.length)) {
      self.values[index] = value;
    }
  },
  setValues(indices: number[], values: IValueType[]) {
    const length = indices.length <= values.length ? indices.length : values.length;
    for (let i = 0; i < length; ++i) {
      const index = indices[i];
      if ((index >= 0) && (index < self.values.length)) {
        self.values[index] = values[i];
      }
    }
  },
  removeValues(index: number, count: number = 1) {
    if ((index != null) && (index < self.values.length) && (count > 0)) {
      self.values.splice(index, count);
    }
  }
}));
export type IAttribute = typeof Attribute.Type;
export type IAttributeSnapshot = typeof Attribute.SnapshotType;

export const CaseID = types.model('CaseID', {
  id: types.identifier(types.string)
}).preProcessSnapshot((snapshot) => {
  const { id, ...others } = snapshot;
  return { id: id || uuid(), ...others };
});
export type ICaseID = typeof CaseID.Type;

export interface ICase {
  id?: string;
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
  disposeOnAction?: () => void;
}

export interface IInputCase {
  id: string;
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
  return { id: id || uuid(), ...others };
}).extend(self => {
  let attrIDMap: { [index: string]: IAttribute } = {},
      // map from attribute names to attribute IDs
      attrNameMap: { [index: string]: string } = {},
      // map from case IDs to indices
      caseIDMap: { [index: string]: number } = {},
      inFlightActions = 0;
  
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

    let aCase: ICase = { id: caseID };
    self.attributes.forEach((attr) => {
      aCase[attr.name] = attr.value(index);
    });
    return aCase;
  }

  function getCanonicalCase(caseID: string): ICase | undefined {
    const index = caseIDMap[caseID];
    if (index == null) { return undefined; }

    let aCase: ICase = { id: caseID };
    self.attributes.forEach((attr) => {
      aCase[attr.id] = attr.value(index);
    });
    return aCase;
  }

  function setCaseValues(caseValues: IInputCase) {
    const index = caseIDMap[caseValues.id];
    if (index == null) { return; }

    for (let key in caseValues) {
      if (key !== 'id') {
        const attributeID = attrNameMap[key],
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
      caseIndexFromID(id: string) {
        return caseIDMap[id];
      },
      nextCaseID(id: string) {
        const index = caseIDMap[id],
              nextCase = index != null ? self.cases[index + 1] : undefined;
        return nextCase ? nextCase.id : undefined;
      },
      getValue(caseID: string, attributeID: string) {
        const attr = attrIDMap[attributeID],
              index = caseIDMap[caseID];
        return attr && (index != null) ? attr.value(index) : undefined;
      },
      getCaseAtIndex(index: number) {
        const aCase = self.cases[index],
              id = aCase && aCase.id;
        return id ? getCase(id) : undefined;
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
          const inCase = getCase(aCaseID.id),
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
          context.disposeOnAction = onAction(srcDataSet, (action) => {
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
              case 'setCaseValues': {
                const setValuesArgs = action.args && action.args.slice(),
                      actionCases = setValuesArgs && setValuesArgs[0],
                      casesToAdd: ICase[] = [],
                      beforeIDs: (string | undefined)[] = [],
                      casesToRemove: string[] = [];
                let isValidAction = !!(actionCases && actionCases.length);
                (actionCases || []).forEach((aCase: ICase) => {
                  const caseID = aCase.id;
                  let srcCase = srcDataSet && caseID && srcDataSet.getCase(caseID);
                  if (caseID && srcCase) {
                    const shouldInclude = !filter || filter(srcCase),
                          doesInclude = caseIDMap[caseID] != null;
                    // identify cases that now pass the filter after change
                    if (shouldInclude && !doesInclude) {
                      casesToAdd.push(srcCase);
                      // determine beforeIDs so that cases end up in correct locations
                      const srcBeforeID = srcDataSet && srcDataSet.nextCaseID(caseID),
                            dstBeforeID = mapBeforeID(srcDataSet, srcBeforeID);
                      beforeIDs.push(dstBeforeID);
                    }
                    // identify cases that no longer pass the filter after change
                    if (!shouldInclude && doesInclude) {
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
        const { disposeOnAction } = getEnv(self);
        if (disposeOnAction) {
          disposeOnAction();
        }
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
        function beforeIndex(index: number) {
          if (!beforeID) { return self.cases.length; }
          return Array.isArray(beforeID)
                  ? caseIDMap[beforeID[index]]
                  : caseIDMap[beforeID];
        }
        (cases || []).forEach((aCase, index) => {
          if (!aCase || !aCase.id) { return; }
          const newCase = { id: aCase.id },
                _beforeIndex = beforeIndex(index);
          self.attributes.forEach((attr: IAttribute) => {
            const value = aCase[attr.name];
            attr.addValue(value != null ? value : undefined, _beforeIndex);
          });
          if ((_beforeIndex != null) && (_beforeIndex < self.cases.length)) {
            self.cases.splice(_beforeIndex, 0, newCase );
            // increment indices of all subsequent cases
            for (let i = _beforeIndex + 1; i < self.cases.length; ++i) {
              ++caseIDMap[self.cases[i].id];
            }
          }
          else {
            self.cases.push(newCase);
          }
          caseIDMap[self.cases[_beforeIndex].id] = _beforeIndex;
        });
      },

      setCaseValues(cases: IInputCase[]) {
        (cases || []).forEach((caseValues) => {
          setCaseValues(caseValues);
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
              const id = self.cases[i].id;
              caseIDMap[id] = i;
            }
          }
        });
      }
    }
  };
});
export type IDataSet = typeof DataSet.Type;
export type IDataSetSnapshot = typeof DataSet.SnapshotType;

export function addAttributeToDataSet(dataset: IDataSet, snapshot: IAttributeSnapshot, beforeID?: string) {
  if (!snapshot.id) {
    snapshot.id = uuid();
  }
  dataset.addAttributeWithID(snapshot, beforeID);    
}

export function addCasesToDataSet(dataset: IDataSet, cases: ICase[], beforeID?: string | string[]) {
  cases.forEach((aCase) => {
    if (!aCase.id) {
      aCase.id = uuid();
    }
  });
  dataset.addCasesWithIDs(cases, beforeID);
}
