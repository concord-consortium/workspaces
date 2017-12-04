import * as firebase from "firebase"
import { FirebaseWindows } from "./window"
import { PortalInfo, PortalActivity, PortalUser, PortalUserConnectionStatusMap } from "./auth"
import { getUserTemplatePath, getActivityRef, getDocumentPath } from "./refs"

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

export interface FirebaseActivity {
  template: {
    userId: string,
    templateId: string
  }
  name: string
  groups: FirebaseActivityGroupMap
}

export interface FirebaseActivityGroupMap {
  [key: number]: FirebaseActivityGroup
}
export interface FirebaseActivityGroup {
  documentId: string
  portalUsers: PortalUserConnectionStatusMap
}

export interface FirebaseArtifactMap {
  [key: string]: FirebaseArtifact
}

export interface FirebasePublication {
  activityId: number
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

  getFirebaseActivity(activity:PortalActivity) {
    return new Promise<[FirebaseActivity, firebase.database.Reference]>((resolve, reject) => {
      const activityRef = getActivityRef(activity)

      activityRef.once("value")
        .then((snapshot) => {
          const existingFirebaseActivity:FirebaseActivity|null = snapshot.val()
          if (existingFirebaseActivity) {
            resolve([existingFirebaseActivity, activityRef])
          }
          else {
            this.infoRef.once("value", (snapshot) => {
              const info:FirebaseDocumentInfo = snapshot.val()
              const firebaseActivity:FirebaseActivity = {
                template: {
                  userId: info.ownerId,
                  templateId: this.id
                },
                name: info.name,
                groups: {}
              }
              activityRef
                .set(firebaseActivity)
                .then(() => {
                  resolve([firebaseActivity, activityRef])
                })
                .catch(reject)
            })
          }
        })
        .catch(reject)
      })
  }

  getGroupActivityDocument(activity:PortalActivity, group:number) {
    return new Promise<[Document, firebase.database.Reference]>((resolve, reject) => {

      this.getFirebaseActivity(activity)
        .then(([firebaseActivity, activityRef]) => {

          const groupRef = activityRef.child("groups").child(`${group}`)
          groupRef.once("value")
            .then((snapshot) => {
              const existingFirebaseGroup:FirebaseActivityGroup|null = snapshot.val()
              if (existingFirebaseGroup) {
                const documentPath = getDocumentPath(activity, existingFirebaseGroup.documentId)
                Document.LoadDocumentFromFirebase(existingFirebaseGroup.documentId, documentPath)
                  .then((document) => resolve([document, groupRef]))
                  .catch(reject)
              }
              else {
                this.copy(getDocumentPath(activity))
                  .then((document) => {
                    const firebaseGroup:FirebaseActivityGroup = {
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

  copy(newBasePath:string): Promise<Document> {
    return new Promise<Document>((resolve, reject) => {
      const newRef = firebase.database().ref(newBasePath).push()
      const newId = newRef.key as string

      this.ref.once("value", (snapshot) => {
        const documentValue = snapshot.val()
        if (!documentValue) {
          reject("Cannot copy document")
        }
        else {
          newRef.set(documentValue, (err) => {
            if (err) {
              reject(err)
            }
            else {
              resolve(new Document(newId, documentValue, `${newBasePath}/${newId}`))
            }
          })
        }
      })
    })
  }


}