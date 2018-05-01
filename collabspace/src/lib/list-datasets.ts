import * as firebase from "firebase"
import { FirebaseWindowAttrsMap, FirebaseWindowDataSet } from "./window"
import { FirebaseDataSetCreatorMap, Document } from "./document"
import { getRelativeRefPath } from "./refs";

export interface WorkspaceDataSet {
  name: string
  ref: firebase.database.Reference
}

export type ListDataSetsCallback = (dataSets: WorkspaceDataSet[]) => void

export type ListDataSetsOptions = {
  dataSetCreatorsRef: firebase.database.Reference
  attrsRef: firebase.database.Reference
  dataSetDataRef: firebase.database.Reference
  callback: ListDataSetsCallback
}

export const listDataSetsInDocument = (document: Document, callback: ListDataSetsCallback): Function => {
  const dataSetsPath = getRelativeRefPath(document.getDataSetsDataRef())
  const attrsPath = getRelativeRefPath(document.getWindowsDataRef("attrs"))
  const documentDataSet = firebase.database().ref(dataSetsPath).child(document.id)
  const dataSetCreatorsRef = documentDataSet.child("creators")
  const dataSetDataRef = documentDataSet.child("data")
  const attrsRef = firebase.database().ref(attrsPath)

  return listDataSets({dataSetCreatorsRef, attrsRef, dataSetDataRef, callback})
}

export const listDataSets = (options: ListDataSetsOptions): Function => {
  const {dataSetCreatorsRef, attrsRef, dataSetDataRef, callback} = options
  let attrs:FirebaseWindowAttrsMap = {}
  let creators:FirebaseDataSetCreatorMap = {}
  let loadedAttrs = false
  let loadedCreators = false
  const onChange = () => {
    if (!loadedCreators || !loadedAttrs) {
      return
    }
    const dataSets: WorkspaceDataSet[] = []
    Object.keys(creators).forEach((dataSetId) => {
      const windowId = creators[dataSetId]
      const windowAttrs = attrs[windowId]
      if (windowAttrs) {
        dataSets.push({
          name: windowAttrs.title,
          ref: dataSetDataRef.child(dataSetId)
        })
      }
    })
    callback(dataSets)
  }
  const onCreatorsValueChange = dataSetCreatorsRef.on("value", (snapshot) => {
    creators = (snapshot ? snapshot.val() : {}) || {}
    loadedCreators = true
    onChange()
  })
  const onAttrsValueChange = attrsRef.on("value", (snapshot) => {
    attrs = (snapshot ? snapshot.val() : {}) || {}
    loadedAttrs = true
    onChange()
  })
  return () => {
    dataSetCreatorsRef.off("value", onCreatorsValueChange)
    attrsRef.off("value", onAttrsValueChange)
  }
}
