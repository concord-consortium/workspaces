import * as firebase from "firebase"
import { FirebaseWindows } from "./window"
import { PortalInfo, PortalOffering, PortalUser, PortalUserConnectionStatusMap } from "./auth"
import { getUserTemplatePath, getOfferingRef, getDocumentPath } from "./refs"

export interface FirebaseDocumentData {
  windows: FirebaseWindows
}

export interface FirebaseDocumentInfo {
  version: "1.0.0",
  ownerId: string
  createdAt: number|Object
  name: string
}

export interface FirebaseDocument {
  info: FirebaseDocumentInfo
  data?: FirebaseDocumentData
}

export interface FirebaseOffering {
  template: {
    userId: string,
    templateId: string
  }
  name: string
  groups: FirebaseOfferingGroupMap
}

export interface FirebaseOfferingGroupMap {
  [key: number]: FirebaseOfferingGroup
}
export interface FirebaseOfferingGroup {
  documentId: string
  portalUsers: PortalUserConnectionStatusMap
}

export interface FirebaseArtifactMap {
  [key: string]: FirebaseArtifact
}

export interface FirebasePublication {
  offeringId: number
  creator: string
  group: number
  groupMembers: PortalUserConnectionStatusMap
  createdAt: number|object
  documentId: string
  windows: FirebasePublicationWindowMap
}

export interface FirebaseArtifact {
  title: string
  mimeType: string
  url: string
  thumbnailUrl?: string
}

export interface FirebasePublicationWindow {
  title:string
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

  static CreateTemplateInFirebase(ownerId:string, documentId:string): Promise<Document> {
    return new Promise<Document>((resolve, reject) => {
      const firebaseDocument:FirebaseDocument = {
        info: {
          version: "1.0.0",
          ownerId,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          name: "Untitled"
        }
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

  // NOTE: the child should be a key in FirebaseWindow
  // TODO: figure out how to type check the child param in FirebaseWindow
  getWindowsDataRef(child:"attrs"|"order"|"minimizedOrder"|"iframeData") {
    return this.dataRef.child(`windows/${child}`)
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

  getGroupOfferingDocument(offering:PortalOffering, group:number) {
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
                      portalUsers: {}
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

  copy(newBasePath:string, documentFilter?:(firebaseDocument:FirebaseDocument) => void): Promise<Document> {
    return new Promise<Document>((resolve, reject) => {
      const newRef = firebase.database().ref(newBasePath).push()
      const newId = newRef.key as string

      this.ref.once("value", (snapshot) => {
        const firebaseDocument:FirebaseDocument|null = snapshot.val()
        if (!firebaseDocument) {
          reject("Cannot copy document")
        }
        else {
          if (documentFilter) {
            documentFilter(firebaseDocument)
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