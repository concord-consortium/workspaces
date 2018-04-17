import * as firebase from "firebase"
import { PortalOffering } from "./auth"
import escapeFirebaseKey from "./escape-firebase-key"

const isDemo = require("../../functions/demo-info").demoInfo.isDemo

export const getUserTemplateListPath = (userId:string) => {
  return `users/${userId}/templates`
}

export const getUserTemplateListRef = (userId:string) => {
  return firebase.database().ref(getUserTemplateListPath(userId))
}

export const getUserTemplatePath = (userId:string, templateId:string) => {
  return `users/${userId}/templates/${templateId}`
}

export const getUserTemplateRef = (userId:string, templateId:string) => {
  return firebase.database().ref(getUserTemplatePath(userId, templateId))
}

export const getPortalPath = (offering:PortalOffering) => {
  return isDemo(offering.domain) ? "demo" : `portals/${escapeFirebaseKey(offering.domain)}`
}

export const getClassPath = (offering:PortalOffering) => {
  return `${getPortalPath(offering)}/classes/${offering.classInfo.classHash}`
}

export const getOfferingPath = (offering:PortalOffering) => {
  return `${getClassOfferingsPath(offering)}/${offering.id}`
}

export const getOfferingRef = (offering:PortalOffering) => {
  return firebase.database().ref(getOfferingPath(offering))
}

export const getClassOfferingsPath = (offering:PortalOffering) => {
  return `${getClassPath(offering)}/offerings`
}

export const getClassOfferingsRef = (offering:PortalOffering) => {
  return firebase.database().ref(getClassOfferingsPath(offering))
}


export const getDocumentPath = (offering:PortalOffering, documentId?:string) => {
  const prefix = `${getClassPath(offering)}/documents`
  return documentId ? `${prefix}/${documentId}` : prefix
}

export const getDocumentRef = (offering:PortalOffering, documentId?:string) => {
    return firebase.database().ref(getDocumentPath(offering, documentId))
}

export const getPublicationsPath = (offering:PortalOffering, publicationId?:string) => {
  const prefix = `${getClassPath(offering)}/publications`
  return publicationId ? `${prefix}/${publicationId}` : prefix
}

export const getPublicationsRef = (offering:PortalOffering, publicationId?:string) => {
  return firebase.database().ref(getPublicationsPath(offering, publicationId))
}

export const getArtifactsPath = (offering:PortalOffering, artifactId?:string) => {
  const prefix = `${getClassPath(offering)}/artifacts`
  return artifactId ? `${prefix}/${artifactId}` : prefix
}

export const getArtifactsRef = (offering:PortalOffering, artifactId?:string) => {
  return firebase.database().ref(getArtifactsPath(offering, artifactId))
}

export const getArtifactsStoragePath = (offering:PortalOffering, publicationId:string) => {
  return `artifacts/${getOfferingPath(offering)}/publications/${publicationId}`
}

export const getSupportsPath = (offering:PortalOffering, supportId?:string) => {
  const prefix = `${getClassPath(offering)}/supports`
  return supportId ? `${prefix}/${supportId}` : prefix
}

export const getSupportsRef = (offering:PortalOffering, supportId?:string) => {
  return firebase.database().ref(getSupportsPath(offering, supportId))
}

export const getSupportsSeenPath = (offering:PortalOffering, userId?:string, supportId?:string) => {
  let path = `${getClassPath(offering)}/supportsSeen`
  if (userId) {
    path = `${path}/users/${escapeFirebaseKey(userId)}`
    if (supportId) {
      path = `${path}/supports/${supportId}`
    }
  }
  return path
}

export const getSupportsSeenRef = (offering:PortalOffering, userId?:string, supportId?:string) => {
  return firebase.database().ref(getSupportsSeenPath(offering, userId, supportId))
}

export const getRelativeRefPath = (ref:firebase.database.Reference) => {
  return ref.toString().substring(ref.root.toString().length)
}

export const getUploadsStoragePath = (offering:PortalOffering|null, uploadId?:string) => {
  const prefix = offering ? `${getClassPath(offering)}/uploads` : 'uploads'
  return uploadId ? `${prefix}/${uploadId}` : prefix
}

export const getSnapshotStoragePath = (offering:PortalOffering, id?:string) => {
  const prefix = `snapshots/${getOfferingPath(offering)}`
  return id ? `${prefix}/${id}` : prefix
}

export const getFavoritesPath = (offering:PortalOffering, userId:string, publicationId?: string, windowId?:string) => {
  const userPath = `${getClassPath(offering)}/favorites/users/${escapeFirebaseKey(userId)}`
  if (publicationId) {
    const publicationPath = `${userPath}/publications/${publicationId}`
    return windowId ? `${publicationPath}/windows/${windowId}` : publicationPath
  }
  else {
    return userPath
  }
}

export const getFavoritesRef = (offering:PortalOffering, userId:string, publicationId?: string, windowId?:string) => {
  return firebase.database().ref(getFavoritesPath(offering, userId, publicationId, windowId))
}
