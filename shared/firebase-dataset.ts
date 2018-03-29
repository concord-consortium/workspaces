import { addMiddleware, applySnapshot, getEnv, IMiddlewareEvent } from 'mobx-state-tree';
import { ICase, IInputCase, DataSet, IDataSet, IDataSetSnapshot,
        addAttributeToDataSet, addCanonicalCasesToDataSet } from '../neo-codap/src/data-manager/data-manager';
import * as firebase from 'firebase';
import { IAttributeSnapshot, IValueType } from '../neo-codap/src/data-manager/attribute';
import cloneDeep = require('lodash/cloneDeep');
import each = require('lodash/each');

type FirebaseRef = firebase.database.Reference;

const kPropertiesPath = '/properties',
      kAttributesPath = '/attributes',
      kCasesPath = '/cases',

      kFirebaseKeyName = 'key',
      kLocalIDName = '__id__';

function cloneWithoutID(obj: any, idProp: string) {
  if (!obj) { return obj; }
  const copy = cloneDeep(obj);
  if (copy[idProp]) { delete copy[idProp]; }
  return copy;
}

function replaceKey(obj: any, oldKey: string, newKey: string) {
  const value = obj[oldKey];
  if (value !== undefined) {
    obj[newKey] = value;
    delete obj[oldKey];
  }
}

function canonicalizeCaseSnapshot(dataSet: IDataSet, aCase: ICase | IInputCase) {
  const canonicalCase: ICase = {};
  each(aCase, (value: IValueType, key: string) => {
    // this will strip the __id__ since there is no attribute
    const attr = dataSet.attrFromName(key);
    if (attr) { canonicalCase[attr.id] = value; }
  });
  return canonicalCase;
}

function saveDataSetToFirebase(dataSet: IDataSet, firebaseRef: FirebaseRef) {
  firebaseRef.set({
    properties: {
      id: dataSet.id,
      name: dataSet.name
    },
    attributes: [],
    cases: []
  });

  dataSet.attributes.forEach((attr) => {
    firebaseRef.child(kAttributesPath).push({
      id: attr.id,
      name: attr.name,
      hidden: attr.hidden,
      units: attr.units,
      formula: attr.formula
    });
  });

  dataSet.cases.forEach((aCase) => {
    const canonicalCase = dataSet.getCanonicalCase(aCase[kLocalIDName]);
    if (canonicalCase) {
      replaceKey(canonicalCase, kLocalIDName, kFirebaseKeyName);
      firebaseRef.child(kCasesPath).push(canonicalCase);
    }
  });
}

export function loadDataSetFromFirebase(firebaseRef: FirebaseRef, readOnly: boolean = false) {
  let dataSet: IDataSet,
      isFromFirebase = false;

  function applyFirebaseAction(action: () => void) {
    isFromFirebase = true;
    action();
    isFromFirebase = false;
  }

  function pushCases(cases: ICase[]) {
    if (cases) {
      cases.forEach((aCase) => {
        const newCaseRef = firebaseRef.child(kCasesPath).push();
        if (newCaseRef && newCaseRef.key) {
          // store ID with case to avoid storing "empty" objects in Firebase
          aCase[kLocalIDName] = newCaseRef.key;
          newCaseRef.set(aCase);
        }
      });
    }
  }

  /*
   * intercepts locally triggered actions to send them to Firebase first.
   * Thus, all changes are handled by Firebase, and synchronizing the local
   * model happens on receipt of Firebase events.
   */
  function firebaseMiddleware(call: IMiddlewareEvent, next: (call: IMiddlewareEvent) => any) {

    function applyActionToFirebase(action: () => void) {
      // for notification purposes, consider the _next_ action
      // to be the root of the action sequence.
      ++call.rootId;

      // async call breaks mobx state tree action chain,
      // so subsequent actions are treated as top-level
      // actions rather than dependent actions, because
      // dependent actions don't trigger onAction handlers.
      setTimeout(action);
    }

    if ((call.type === 'action') && !isFromFirebase) {
      // if readOnly, exit without making any changes
      if (readOnly) { return; }

      // redirect actions to Firebase
      switch(call.name) {
        case 'addAttributeWithID': {
          const snapshot = call.args[0],
                pushRef = firebaseRef.child(kAttributesPath).push();
          applyActionToFirebase(() => {
            pushRef.set(cloneWithoutID(snapshot, 'id'));
          });
          break;
        }
        case 'setAttributeName': {
          const attrID = call.args[0],
                name = call.args[1];
          applyActionToFirebase(() => {
            firebaseRef.child(`${kAttributesPath}/${attrID}`).child('name').set(name);
          });
          break;
        }
        case 'removeAttribute': {
          const attrID = call.args[0];
          applyActionToFirebase(() => {
            firebaseRef.child(`${kAttributesPath}/${attrID}`).remove();
          });
          break;
        }
        case 'addCasesWithIDs': {
          const cases = call.args[0];
          applyActionToFirebase(() => {
            pushCases((cases || []).map((aCase: ICase) => canonicalizeCaseSnapshot(dataSet, aCase)));
          });
          break;
        }
        case 'addCanonicalCasesWithIDs': {
          const cases = call.args[0];
          applyActionToFirebase(() => {
            pushCases((cases || []).map((aCase: IInputCase) => cloneDeep(aCase)));
          });
          break;
        }
        case 'setCaseValues': {
          const caseValues = call.args[0],
                updates: { [index: string]: IValueType | null } = {};
          caseValues.forEach((aCase: IInputCase) => {
            const id = aCase[kLocalIDName];
            each(aCase, (value, key) => {
              const attr = dataSet.attrFromName(key);
              if (attr) {
                updates[`${id}/${attr.id}`] = value;
              }
            });
          });
          if (Object.keys(updates).length) {
            applyActionToFirebase(() => {
              firebaseRef.child(kCasesPath).update(updates);
            });
          }
          break;
        }
        case 'setCanonicalCaseValues': {
          const caseValues = call.args[0],
                updates: { [index: string]: IValueType | null } = {};
          caseValues.forEach((aCase: IInputCase) => {
            const id = aCase[kLocalIDName];
            each(aCase, (value, key) => {
              if (key !== kLocalIDName) {
                updates[`${id}/${key}`] = value;
              }
            });
          });
          if (Object.keys(updates).length) {
            applyActionToFirebase(() => {
              firebaseRef.child(kCasesPath).update(updates);
            });
          }
          break;
        }
        case 'removeCases': {
          const cases: string[] = call.args[0],
                updates: { [index: string]: null } = {};
          cases.forEach((caseID) => {
            updates[caseID] = null;
          });
          if (Object.keys(updates).length) {
            applyActionToFirebase(() => {
              firebaseRef.child(kCasesPath).update(updates);
            });
          }
          break;
        }
        // other actions can be handled normally by the DataSet
        default:
          return next(call);
      }
    }
    else {
      return next(call);
    }
  }

  function attachDataSetHandler(firebaseRef: FirebaseRef) {
    const propertiesRef = firebaseRef.child(kPropertiesPath);

    propertiesRef.on('value', (snapshot) => {
      const aSnapshot = (snapshot && snapshot.val()) || { name: "Default" };
      if (!dataSet) {
        dataSet = DataSet.create(aSnapshot as IDataSetSnapshot);
      }
      else {
        applyFirebaseAction(() => applySnapshot(dataSet, aSnapshot));
      }
    });

    // Based on https://stackoverflow.com/a/27995609, the 'once' handler
    // should fire after the initial firing of the 'on' handler.
    return propertiesRef.once('value');
  }

  function attachAttributeHandlers(firebaseRef: FirebaseRef, dataSet: IDataSet) {
    const attributesRef = firebaseRef.child(kAttributesPath);

    attributesRef.on('child_added', (child) => {
      if (!child || !child.key) { return; }
      const snapshot: IAttributeSnapshot = Object.assign({ id: child.key }, child.val());
      applyFirebaseAction(() => dataSet.addAttributeWithID(snapshot));
    });

    attributesRef.on('child_changed', (child) => {
      if (!child || !child.key) { return; }
      const attribute = dataSet.attrFromID(child.key),
            snapshot: IAttributeSnapshot = Object.assign({ id: child.key }, child.val());
      if (attribute && snapshot) {
        applyFirebaseAction(() => applySnapshot(attribute, snapshot));
      }
    });

    attributesRef.on('child_removed', (child) => {
      if (!child || !child.key) { return; }
      applyFirebaseAction(() => child.key && dataSet.removeAttribute(child.key));
    });

    // According to https://stackoverflow.com/a/27995609, this will resolve after
    // the preexisting attributes have all been handled in the 'child_added' handler.
    return attributesRef.once('value');
  }

  function attachCaseHandlers(firebaseRef: FirebaseRef, dataSet: IDataSet) {
    const casesRef = firebaseRef.child(kCasesPath);

    casesRef.on('child_added', (child) => {
      if (!child || !child.key) { return; }
      const snapshot: ICase = Object.assign({ [kLocalIDName]: child.key }, child.val());
      // cases added as empty objects earlier may already be in the DataSet
      if (dataSet.caseIndexFromID(child.key) == null) {
        applyFirebaseAction(() => dataSet.addCanonicalCasesWithIDs([snapshot]));
      }
      else {
        applyFirebaseAction(() => dataSet.setCanonicalCaseValues([snapshot as IInputCase]));
      }
    });

    casesRef.on('child_changed', (child) => {
      if (!child || !child.key) { return; }
      const snapshot: IInputCase = Object.assign({ [kLocalIDName]: child.key }, child.val());
      applyFirebaseAction(() => dataSet.setCanonicalCaseValues([snapshot]));
    });

    casesRef.on('child_removed', (child) => {
      if (!child || !child.key) { return; }
      applyFirebaseAction(() => child.key && dataSet.removeCases([child.key]));
    });

    // According to https://stackoverflow.com/a/27995609, this will resolve after
    // the preexisting cases have all been handled in the 'child_added' handler.
    return casesRef.once('value');
  }

  return attachDataSetHandler(firebaseRef)
    .then((snapshot) => {
      return attachAttributeHandlers(firebaseRef, dataSet);
    })
    .then((snapshot) => {
      return attachCaseHandlers(firebaseRef, dataSet);
    })
    .then((snapshot) => {
      dataSet.addMiddleware('firebaseMiddleware', firebaseMiddleware);
      return dataSet;
    });
}
