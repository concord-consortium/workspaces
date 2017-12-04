import * as firebase from "firebase"
import { PortalActivity } from "./auth"

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

export const getPortalPath = (activity:PortalActivity) => {
  return activity.domain === "demo" ? "demo" : `portals/${activity.domain}`
}

export const getClassPath = (activity:PortalActivity) => {
  return `${getPortalPath(activity)}/classes/${activity.classInfo.classHash}`
}

export const getActivityPath = (activity:PortalActivity) => {
  return `${getClassPath(activity)}/activities/${activity.id}`
}

export const getActivityRef = (activity:PortalActivity) => {
  return firebase.database().ref(getActivityPath(activity))
}

export const getDocumentPath = (activity:PortalActivity, documentId?:string) => {
  const prefix = `${getClassPath(activity)}/documents`
  return documentId ? `${prefix}/${documentId}` : prefix
}

export const getDocumentRef = (activity:PortalActivity, documentId?:string) => {
  return firebase.database().ref(getDocumentPath(activity, documentId))
}

export const getPublicationsPath = (activity:PortalActivity, publicationId?:string) => {
  const prefix = `${getClassPath(activity)}/publications`
  return publicationId ? `${prefix}/${publicationId}` : prefix
}

export const getPublicationsRef = (activity:PortalActivity, publicationId?:string) => {
  return firebase.database().ref(getPublicationsPath(activity, publicationId))
}

export const getArtifactsPath = (activity:PortalActivity, artifactId?:string) => {
  const prefix = `${getClassPath(activity)}/artifacts`
  return artifactId ? `${prefix}/${artifactId}` : prefix
}

export const getArtifactsRef = (activity:PortalActivity, artifactId?:string) => {
  return firebase.database().ref(getArtifactsPath(activity, artifactId))
}

export const getArtifactsStoragePath = (activity:PortalActivity, publicationId:string) => {
  return `artifacts/${getActivityPath(activity)}/publications/${publicationId}`
}
