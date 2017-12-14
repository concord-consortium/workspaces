import * as firebase from "firebase"
import * as queryString from "query-string"
import * as superagent from "superagent"
import * as jwt from "jsonwebtoken"
import { UserLookup } from "./user-lookup";

const isDemo = require("../../functions/demo-info").demoInfo.isDemo

const initials = require("initials")

export interface AuthQueryParams {
  demo?: string
  token?: string
  domain?: string
  domain_uid?: string
  jwtToken?: string
  document?: string
  publication?: string
  offering?: string
  classInfoUrl?: string
  offeringId?: number
}

export interface PortalAPIClassUser {
  id: string
  first_name: string
  last_name: string
}

export interface PortalAPIClassInfo {
  uri: string
  name: string
  state: string
  class_hash: string
  teachers: PortalAPIClassUser[]
  students: PortalAPIClassUser[]
}

export interface PortalAPIOfferingInfo {
  clazz_info_url: string
}

export interface OfferingInfo {
  id: number
  classInfoUrl: string
}

export interface PortalAPIOfferingStudent {
  endpoint_url: string
  name: string
  started_activity: boolean
  user_id: number
  username: string
}

export interface PortalClassInfo {
  uri: string
  name: string
  state: string
  classHash: string
  teachers: TeacherUser[]
  students: StudentUser[]
}

export type PortalUserConnectionStatus = PortalUserConnected | PortalUserDisconnected

export interface PortalUserConnected {
  connected: true
  connectedAt: number|object
}
export interface PortalUserDisconnected {
  connected: false
  disconnectedAt: number|object
}

export interface PortalUserConnectionStatusMap {
  [key: string]: PortalUserConnectionStatus
}

export type PortalUser = TeacherUser | StudentUser
export interface PortalUserMap {
  [key: string]: PortalUser|null
}

export interface TeacherUser {
  type: "teacher"
  id: string
  firstName: string
  lastName: string
  fullName: string
  initials: string
}

export interface StudentUser {
  type: "student"
  id: string
  firstName: string
  lastName: string
  fullName: string
  initials: string
}

export interface PortalOffering {
  id: number
  domain: string
  classInfo: PortalClassInfo
  isDemo: boolean
  classInfoUrl: string
}

export interface PortalTokens {
  rawPortalJWT: string
  portalJWT: PortalJWT
  rawFirebaseJWT: string
  firebaseJWT: PortalFirebaseJWT
  domain: string
}

export interface PortalInfo {
  user: PortalUser|null
  offering: PortalOffering|null
  tokens: PortalTokens|null
}

export interface PortalFirebaseJWTStudentClaims {
  user_type: "learner"
  user_id: string
  class_hash: string
  offering_id: number
}
export interface PortalFirebaseJWTTeacherClaims {
  user_type: "teacher"
  user_id: string
  class_hash: string
}
export type PortalFirebaseJWTClaims = PortalFirebaseJWTStudentClaims | PortalFirebaseJWTTeacherClaims

export interface BasePortalFirebaseJWT {
  alg: string
  iss: string
  sub: string
  aud: string
  iat: number
  exp: number
  uid: number
}

export interface PortalFirebaseStudentJWT extends BasePortalFirebaseJWT {
  domain: string
  domain_uid: number
  externalId: number
  returnUrl: string
  logging: boolean
  class_info_url: string
  claims: PortalFirebaseJWTStudentClaims
}

export interface PortalFirebaseTeacherJWT extends BasePortalFirebaseJWT {
  domain: string
  domain_uid: number
  claims: PortalFirebaseJWTTeacherClaims
}

export type PortalFirebaseJWT = PortalFirebaseStudentJWT | PortalFirebaseTeacherJWT

export type PortalJWT = PortalStudentJWT | PortalTeacherJWT

export interface BasePortalJWT {
  alg: string
  iat: number
  exp: number
  uid: number
}

export interface PortalStudentJWT extends BasePortalJWT {
  domain: string
  user_type: "learner"
  user_id: string
  learner_id: number
  class_info_url: string
  offering_id: number
}

export interface PortalTeacherJWT extends BasePortalJWT {
  domain: string
  user_type: "teacher"
  user_id: string
  teacher_id: number
}

export const getErrorMessage = (err: any, res:superagent.Response) => {
  return (res.body ? res.body.message : null) || err
}

export const getPortalJWTWithBearerToken = (domain:string, type:string, token:string, demo?:string) => {
  return new Promise<[string, PortalJWT]>((resolve, reject) => {
    const url = `${domain}${isDemo(domain) ? `demoGetFakePortalJWT?demo=${demo}` : "api/v1/jwt/portal"}`
    superagent
      .get(url)
      .set("Authorization", `${type} ${token}`)
      .end((err, res) => {
        if (err) {
          reject(getErrorMessage(err, res))
        }
        else if (!res.body || !res.body.token) {
          reject("No token found in JWT request response")
        }
        else {
          const {token} = res.body
          const portalJWT = jwt.decode(token)
          if (portalJWT) {
            resolve([token, portalJWT as PortalJWT])
          }
          else {
            reject('Invalid portal token')
          }
        }
      })
  })
}

export const getFirebaseJWTWithBearerToken = (domain: string, type: string, token:string, demo?:string) => {
  return new Promise<[string, PortalFirebaseJWT]>((resolve, reject) => {
    const url = `${domain}${isDemo(domain) ? `demoGetFakeFirebaseJWT?demo=${demo}` : "api/v1/jwt/firebase?firebase_app=collabspace"}`
    superagent
      .get(url)
      .set("Authorization", `${type} ${token}`)
      .end((err, res) => {
        if (err) {
          reject(getErrorMessage(err, res))
        }
        else if (!res.body || !res.body.token) {
          reject("No Firebase token found in Firebase JWT request response")
        }
        else {
          const {token} = res.body
          const firebaseJWT = jwt.decode(token)
          if (firebaseJWT) {
            resolve([token, firebaseJWT as PortalFirebaseJWT])
          }
          else {
            reject('Invalid Firebase token')
          }
        }
      })
  })
}

export const getClassInfo = (classInfoUrl:string, rawPortalJWT:string) => {
  return new Promise<PortalClassInfo>((resolve, reject) => {
    superagent
    .get(classInfoUrl)
    .set("Authorization", `Bearer/JWT ${rawPortalJWT}`)
    .end((err, res) => {
      if (err) {
        reject(getErrorMessage(err, res))
      }
      else if (!res.body || !res.body.class_hash) {
        reject("Invalid class info response")
      }
      else {
        const apiClassInfo:PortalAPIClassInfo = res.body

        let user:PortalUser|null = null

        const classInfo:PortalClassInfo = {
          uri: apiClassInfo.uri,
          name: apiClassInfo.name,
          state: apiClassInfo.state,
          classHash: apiClassInfo.class_hash,
          teachers: apiClassInfo.teachers.map((apiTeacher) => {
            const fullName = `${apiTeacher.first_name} ${apiTeacher.last_name}`
            const teacher:TeacherUser = {
              type: "teacher",
              id: apiTeacher.id,
              firstName: apiTeacher.first_name,
              lastName: apiTeacher.last_name,
              fullName,
              initials: initials(fullName)
            }
            return teacher
          }),
          students: apiClassInfo.students.map((apiStudent) => {
            const fullName = `${apiStudent.first_name} ${apiStudent.last_name}`
            const student:StudentUser = {
              type: "student",
              id: apiStudent.id,
              firstName: apiStudent.first_name,
              lastName: apiStudent.last_name,
              fullName,
              initials: initials(fullName)
            }
            return student
          })
        }

        resolve(classInfo)
      }
    })
  })
}

export const collabSpaceAuth = () => {
  return new Promise<PortalInfo>((resolve, reject) => {
    const params:AuthQueryParams = queryString.parse(window.location.search)
    const {token, domain} = params

    // no token means not launched from portal so there is no portal user
    if (!token) {
      return resolve({
        user: null,
        offering: null,
        tokens: null
      })
    }

    if (!domain) {
      return reject("Missing domain query parameter (required when token parameter is present)")
    }

    return getPortalJWTWithBearerToken(domain, "Bearer", token, params.demo)
      .then(([rawPortalJWT, portalJWT]) => {
        if (portalJWT.user_type !== "learner") {
          return reject("Non-student login to the CollabSpace is not allowed")
        }
        const portalStudentJWT:PortalStudentJWT = portalJWT

        return getFirebaseJWTWithBearerToken(domain, "Bearer", token, params.demo)
          .then(([rawFirebaseJWT, firebaseJWT]) => {
            const classInfoUrl = portalStudentJWT.class_info_url

            return getClassInfo(classInfoUrl, rawPortalJWT)
              .then((classInfo) => {
                let user:PortalUser|null = null
                classInfo.students.forEach((student) => {
                  if (student.id === portalJWT.user_id) {
                    user = student
                  }
                })
                if (!user) {
                  reject("Current user not found in class roster")
                }

                const domainParser = document.createElement("a")
                domainParser.href = portalJWT.domain

                resolve({
                  user: user,
                  offering: {
                    id: portalStudentJWT.offering_id,
                    domain: isDemo(domain) ? "demo" : domainParser.host,
                    classInfo: classInfo,
                    isDemo: isDemo(domain),
                    classInfoUrl
                  },
                  tokens: {
                    domain,
                    rawPortalJWT,
                    portalJWT,
                    rawFirebaseJWT,
                    firebaseJWT
                  }
                })
              })
          })
      })
      .catch((err) => reject(err.toString()))
  })
}

export const firebaseAuth = () => {
  return new Promise<firebase.User>((resolve, reject) => {
    firebase.auth().onAuthStateChanged((firebaseUser) => {
      if (firebaseUser) {
        resolve(firebaseUser)
      }
    })
    firebase.auth().signInAnonymously().catch(reject)
  })
}

export const getOfferingInfo = (offeringUrl:string, token:string) => {
  return new Promise<OfferingInfo>((resolve, reject) => {
    superagent
      .get(offeringUrl)
      .set("Authorization", `Bearer ${token}`)
      .end((err, res) => {
        if (err) {
          return reject(getErrorMessage(err, res))
        }

        let offeringId:number|null = 0
        if (isDemo(offeringUrl)) {
          offeringId = 1
        }
        else {
          const matches = offeringUrl.match(/\/offerings\/(\d+)/)
          if (matches) {
            offeringId = parseInt(matches[1])
          }
        }

        if (!offeringId) {
          return reject("Unable to find offering id in url")
        }

        const portalOfferingInfo:PortalAPIOfferingInfo = res.body
        resolve({
          id: offeringId,
          classInfoUrl: portalOfferingInfo.clazz_info_url
        })
      })
  })
}


export const dashboardAuth = () => {
  return new Promise<PortalInfo>((resolve, reject) => {

    const params:AuthQueryParams = queryString.parse(window.location.search)
    const {jwtToken, offering, token, domain, demo, classInfoUrl} = params

    if (jwtToken) {
      const portalJWT:PortalJWT = jwt.decode(jwtToken) as PortalJWT
      if (!portalJWT) {
        return reject("Invalid portalJWT param")
      }

      let classInfoUrl:string|null = null
      let offeringId:number = 0

      if (portalJWT.user_type === "learner") {
        classInfoUrl = portalJWT.class_info_url
        offeringId = portalJWT.offering_id
      }
      else if (params.classInfoUrl && params.offeringId) {
        classInfoUrl = params.classInfoUrl
        offeringId = params.offeringId
      }

      if (!classInfoUrl || !offeringId) {
        return reject("Unable to compute class info url or offering id")
      }

      // needed to do this to keep typescript from complaining about classInfoUrl usage below
      const finalClassInfoUrl = classInfoUrl

      return getFirebaseJWTWithBearerToken(portalJWT.domain, "Bearer/JWT", jwtToken, params.demo)
        .then(([rawFirebaseJWT, firebaseJWT]) => {

          getClassInfo(finalClassInfoUrl, jwtToken)
            .then((classInfo) => {
              const userLookup = new UserLookup(classInfo)
              const user = userLookup.lookup(portalJWT.user_id)
              if (!user) {
                return reject("Current user not found in class roster")
              }

              const domainParser = document.createElement("a")
              domainParser.href = portalJWT.domain

              resolve({
                user: user,
                offering: {
                  id: offeringId,
                  domain: isDemo(portalJWT.domain) ? "demo" : domainParser.host,
                  classInfo: classInfo,
                  isDemo: isDemo(portalJWT.domain),
                  classInfoUrl: finalClassInfoUrl
                },
                tokens: {
                  domain: portalJWT.domain,
                  rawPortalJWT: jwtToken,
                  portalJWT,
                  rawFirebaseJWT,
                  firebaseJWT
                }
              })
            })
            .catch(reject)
        })
    }
    else if (offering && token) {
      const offeringParser = document.createElement("a")
      offeringParser.href = offering
      const domain = `${offeringParser.protocol}//${offeringParser.host}/`

      return getPortalJWTWithBearerToken(domain, "Bearer", token, params.demo)
        .then(([rawPortalJWT, portalJWT]) => {
          if (portalJWT.user_type !== "teacher") {
            return reject("Non-teacher login to the CollabSpace is not allowed via the offering param")
          }
          const portalTeacherJWT:PortalTeacherJWT = portalJWT

          return getFirebaseJWTWithBearerToken(domain, "Bearer", token, params.demo)
            .then(([rawFirebaseJWT, firebaseJWT]) => {

              return getOfferingInfo(offering, token)
                .then((offeringInfo) => {
                  const classInfoUrl = offeringInfo.classInfoUrl
                  getClassInfo(classInfoUrl, rawPortalJWT)
                    .then((classInfo) => {
                      const userLookup = new UserLookup(classInfo)
                      const user = userLookup.lookup(portalJWT.user_id)
                      if (!user) {
                        return reject("Current user not found in class roster")
                      }

                      const domainParser = document.createElement("a")
                      domainParser.href = portalJWT.domain

                      resolve({
                        user: user,
                        offering: {
                          id: offeringInfo.id,
                          domain: isDemo(portalJWT.domain) ? "demo" : domainParser.host,
                          classInfo: classInfo,
                          isDemo: isDemo(portalJWT.domain),
                          classInfoUrl
                        },
                        tokens: {
                          domain: portalJWT.domain,
                          rawPortalJWT,
                          portalJWT,
                          rawFirebaseJWT,
                          firebaseJWT
                        }
                      })
                    })
                    .catch(reject)
                })
            })
          })
    }
    else {
      reject("Missing valid auth query parameter combination")
    }

  })
}