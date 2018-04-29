import * as firebase from "firebase"
import { FirebaseWindows } from "./window"
import { PortalInfo, PortalOffering, PortalUser, PortalUserConnectionStatusMap } from "./auth"
import { getUserTemplatePath, getOfferingRef, getDocumentPath } from "./refs"

export interface FirebaseDataSetCreatorMap {
  [key: string]: string
}

export interface FirebaseDataSetMap {
  [key: string]: FirebaseDataSet
}

export interface FirebaseDataSet {
  creators: FirebaseDataSetCreatorMap
  data: any
}

export interface FirebaseDocumentData {
  datasets?: FirebaseDataSetMap
  windows: FirebaseWindows
}

export interface FirebaseDocumentInfo {
  version: "1.0.0",
  ownerId: string
  createdAt: number|Object
  name: string
  portalUrl?: string
  portalEditUrl?: string
}

export interface FirebaseDocument {
  info: FirebaseDocumentInfo
  data?: FirebaseDocumentData
}

export interface FirebaseOfferingTemplate {
  userId: string,
  templateId: string
}
export interface FirebaseOffering {
  template: FirebaseOfferingTemplate
  name: string
  groups: FirebaseOfferingGroupMap
}
export interface FirebaseOfferingMap {
  [key: number]: FirebaseOffering
}

export interface FirebaseOfferingGroupMap {
  [key: string]: FirebaseOfferingGroup
}
export interface FirebaseOfferingGroup {
  documentId: string
  users: PortalUserConnectionStatusMap
}

export interface FirebaseArtifactMap {
  [key: string]: FirebaseArtifact
}

export interface FirebasePublication {
  offeringId: number
  creator: string
  group: string
  groupMembers: PortalUserConnectionStatusMap
  createdAt: number|object
  documentId: string
  windows: FirebasePublicationWindowMap
  partial: boolean
}
export interface FirebasePublicationMap {
  [key: string]: FirebasePublication
}

export interface FirebaseArtifact {
  title: string
  mimeType: string
  url: string
  thumbnailUrl?: string
}

export interface FirebasePublicationWindow {
  title:string
  ownerId?:string
  artifacts: FirebaseArtifactMap
}

export interface FirebasePublicationWindowMap {
  [key: string]: FirebasePublicationWindow
}


export class Document {

  id: string
  ownerId: string
  firebaseDocument: FirebaseDocument
  ref: firebase.database.Reference
  dataRef: firebase.database.Reference
  infoRef: firebase.database.Reference
  isReadonly: boolean

  constructor (id: string, firebaseDocument:FirebaseDocument, firebasePath: string) {
    this.id = id
    this.ownerId = firebaseDocument.info.ownerId
    this.firebaseDocument = firebaseDocument
    this.ref = firebase.database().ref(firebasePath)
    this.dataRef = this.ref.child("data")
    this.infoRef = this.ref.child("info")
  }

  destroy() {
  }

  static CreateTemplateInFirebase(ownerId:string, documentId:string, portalUrl?:string): Promise<Document> {
    return new Promise<Document>((resolve, reject) => {
      const firebaseDocument:FirebaseDocument = {
        info: {
          version: "1.0.0",
          ownerId,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          name: "Untitled"
        }
      }
      if (portalUrl) {
        firebaseDocument.info.portalUrl = portalUrl  // firebase does not like sets of undefined (the set below was not returning because of it)
      }
      const firebasePath = getUserTemplatePath(ownerId, documentId)
      const documentRef = firebase.database().ref(firebasePath)
      documentRef.set(firebaseDocument, (err) => {
        if (err) {
          reject("Unable to create collaborative space document!")
        }
        else {
          resolve(new Document(documentId, firebaseDocument, firebasePath))
        }
      })
    })
  }

  static LoadDocumentFromFirebase(documentId:string, firebasePath:string): Promise<Document> {
    return new Promise<Document>((resolve, reject) => {
      const documentRef = firebase.database().ref(firebasePath)
      documentRef.once("value", (snapshot) => {
        const firebaseDocument:FirebaseDocument = snapshot.val()
        if (!firebaseDocument) {
          reject("Unable to load collaborative space document!")
        }
        else {
          resolve(new Document(documentId, firebaseDocument, firebasePath))
        }
      })
    })
  }

  static ParseTemplateHashParam(param:string) {
    const [ownerId, templateId, ...rest] = param.split(":")
    if (ownerId && templateId) {
      return {ownerId, templateId}
    }
    return null
  }

  static StringifyTemplateHashParam(ownerId:string, documentId:string) {
    return `${ownerId}:${documentId}`
  }

  getTemplateHashParam() {
    return Document.StringifyTemplateHashParam(this.ownerId, this.id)
  }

  getWindowsRef() {
    return this.dataRef.child("windows")
  }

  // NOTE: the child should be a key in FirebaseWindow
  // TODO: figure out how to type check the child param in FirebaseWindow
  getWindowsDataRef(child:"attrs"|"order"|"minimizedOrder"|"iframeData"|"annotations") {
    return this.getWindowsRef().child(child)
  }

  getDataSetsDataRef() {
    return this.dataRef.child("datasets")
  }

  getFirebaseOffering(offering:PortalOffering) {
    return new Promise<[FirebaseOffering, firebase.database.Reference]>((resolve, reject) => {
      const offeringRef = getOfferingRef(offering)

      offeringRef.once("value")
        .then((snapshot) => {
          const existingFirebaseOffering:FirebaseOffering|null = snapshot.val()
          if (existingFirebaseOffering) {
            resolve([existingFirebaseOffering, offeringRef])
          }
          else {
            this.infoRef.once("value", (snapshot) => {
              const info:FirebaseDocumentInfo = snapshot.val()
              const firebaseOffering:FirebaseOffering = {
                template: {
                  userId: info.ownerId,
                  templateId: this.id
                },
                name: info.name,
                groups: {}
              }
              offeringRef
                .set(firebaseOffering)
                .then(() => {
                  resolve([firebaseOffering, offeringRef])
                })
                .catch(reject)
            })
          }
        })
        .catch(reject)
      })
  }

  getGroupOfferingDocument(offering:PortalOffering, group:string) {
    return new Promise<[Document, firebase.database.Reference]>((resolve, reject) => {

      this.getFirebaseOffering(offering)
        .then(([firebaseOffering, offeringRef]) => {

          const groupRef = offeringRef.child("groups").child(`${group}`)
          groupRef.once("value")
            .then((snapshot) => {
              const existingFirebaseGroup:FirebaseOfferingGroup|null = snapshot.val()
              if (existingFirebaseGroup) {
                const documentPath = getDocumentPath(offering, existingFirebaseGroup.documentId)
                Document.LoadDocumentFromFirebase(existingFirebaseGroup.documentId, documentPath)
                  .then((document) => resolve([document, groupRef]))
                  .catch(reject)
              }
              else {
                this.copy(getDocumentPath(offering))
                  .then((document) => {
                    const firebaseGroup:FirebaseOfferingGroup = {
                      documentId: document.id,
                      users: {}
                    }
                    groupRef
                      .set(firebaseGroup)
                      .then(() => resolve([document, groupRef]))
                      .catch(reject)
                  })
                  .catch(reject)
              }
            })
            .catch(reject)
        })
        .catch(reject)
    })
  }

  copy(newBasePath:string, documentFilter?:(firebaseDocument:FirebaseDocument, newId: string) => void): Promise<Document> {
    return new Promise<Document>((resolve, reject) => {
      const newRef = firebase.database().ref(newBasePath).push()
      const newId = newRef.key as string

      this.ref.once("value", (snapshot) => {
        const firebaseDocument:FirebaseDocument|null = snapshot.val()
        if (!firebaseDocument) {
          reject("Cannot copy document")
        }
        else {
          // update the dataset document ids
          if (firebaseDocument.data) {
            if (firebaseDocument.data.datasets) {
              const {datasets} = firebaseDocument.data
              const updatedDataSets:FirebaseDataSetMap = {}
              Object.keys(firebaseDocument.data.datasets).forEach((dataSetId) => {
                const updatedId = dataSetId === this.id ? newId : dataSetId
                updatedDataSets[updatedId] = datasets[dataSetId]
              })
              firebaseDocument.data.datasets = updatedDataSets
            }

            const {attrs} = firebaseDocument.data.windows ? firebaseDocument.data.windows : {attrs:null}
            if (attrs) {
              Object.keys(attrs).forEach((windowId) => {
                const windowAttrs = attrs[windowId]
                if (windowAttrs && windowAttrs.dataSet) {
                  if (windowAttrs.dataSet.documentId === this.id) {
                    windowAttrs.dataSet.documentId = newId
                  }
                }
              })
            }
          }

          if (documentFilter) {
            documentFilter(firebaseDocument, newId)
          }

          newRef.set(firebaseDocument, (err) => {
            if (err) {
              reject(err)
            }
            else {
              resolve(new Document(newId, firebaseDocument, `${newBasePath}/${newId}`))
            }
          })
        }
      })
    })
  }


}