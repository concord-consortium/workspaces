import * as firebase from "firebase"
import * as queryString from "query-string"
import * as superagent from "superagent"
import * as jwt from "jsonwebtoken"

const initials = require("initials")

export interface AuthQueryParams {
  demo?: string
  token?: string
  domain?: string
  domain_uid?: string
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

export interface PortalActivity {
  id: number
  domain: string
  classInfo: PortalClassInfo
  isDemo: boolean
}

export interface PortalInfo {
  user: PortalUser|null
  activity: PortalActivity|null
}

export interface PortalJWTStudentClaims {
  user_type: "learner"
  user_id: string
  domain: string
  externalId: number
  returnUrl: string
  logging: boolean
  domain_uid: number
  class_info_url: string
  class_hash: string
}
export interface PortalJWTTeacherClaims {
  user_type: "teacher"
  user_id: string
  domain: string
  domain_uid: number
  class_list_url: string
  class_hashes: string[]
}
export type PortalJWTClaims = PortalJWTStudentClaims | PortalJWTTeacherClaims

export interface PortalJWT {
  alg: string
  iss: string
  sub: string
  aud: string
  iat: number
  exp: number
  uid: number
  claims: PortalJWTClaims
}

export const portalAuth = () => {
  return new Promise<PortalInfo>((resolve, reject) => {
    const params:AuthQueryParams = queryString.parse(window.location.search)

    // no token means not launched from portal so there is no portal user
    if (!params.token) {
      resolve({user: null, activity: null})
      return
    }

    if (!params.domain) {
      reject("Missing domain query parameter (required when token parameter is present)")
      return
    }

    const isDemo = params.domain.indexOf("cloudfunctions") !== -1

    const getErrorMessage = (err: any, res:superagent.Response) => {
      return (res.body ? res.body.message : null) || err
    }

    const generateJWTUrl = `${params.domain}${isDemo ? "demoGetFakeFirebaseJWT" : "api/v1/jwt/firebase?firebase_app=collabspace"}`
    superagent
      .get(generateJWTUrl)
      .set("Authorization", `Bearer ${params.token}`)
      .end((err, res) => {
        if (err) {
          reject(getErrorMessage(err, res))
        }
        else if (!res.body || !res.body.token) {
          reject("No token found in JWT request response")
        }
        else {
          const portalJWT:PortalJWT = jwt.decode(res.body.token) as PortalJWT
          const jwtClaims = portalJWT ? portalJWT.claims : null
          if (!jwtClaims) {
            reject("Invalid token found in JWT request response")
          }
          else if (jwtClaims.user_type !== "learner") {
            reject("Teacher login to an activity is not yet available")
          }
          else {
            const classInfoUrl = `${jwtClaims.class_info_url}${isDemo && params.demo ? `?demo=${params.demo}` : ""}`
            superagent
              .get(classInfoUrl)
              .set("Authorization", `Bearer ${params.token}`)
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
                      if (apiTeacher.id === jwtClaims.user_id) {
                        user = teacher
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
                      if (apiStudent.id === jwtClaims.user_id) {
                        user = student
                      }
                      return student
                    })
                  }

                  if (!user) {
                    reject("Current user not found in class roster")
                  }
                  else {
                    const domainParser = document.createElement("a")
                    domainParser.href = jwtClaims.domain

                    resolve({
                      user: user,
                      activity: {
                        id: jwtClaims.externalId,
                        domain: isDemo ? "demo" : domainParser.host,
                        classInfo: classInfo,
                        isDemo: isDemo
                      }
                    })
                  }
                }
              })
          }
        }
      })
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