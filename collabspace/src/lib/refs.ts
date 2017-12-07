import * as firebase from "firebase"
import { PortalOffering } from "./auth"

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
  return offering.domain === "demo" ? "demo" : `portals/${offering.domain}`
}

export const getClassPath = (offering:PortalOffering) => {
  return `${getPortalPath(offering)}/classes/${offering.classInfo.classHash}`
}

export const getOfferingPath = (offering:PortalOffering) => {
  return `${getClassPath(offering)}/offerings/${offering.id}`
}

export const getOfferingRef = (offering:PortalOffering) => {
  return firebase.database().ref(getOfferingPath(offering))
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
