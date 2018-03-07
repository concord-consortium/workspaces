import { PortalClassInfo, PortalUserMap, PortalUser } from "./auth";
import escapeFirebaseKey from "../lib/escape-firebase-key"

export interface UserOptions {
  name: string
  value: string
  key: string
}

export class UserLookup {
  userMap: PortalUserMap
  classInfo: PortalClassInfo|undefined

  constructor (classInfo?:PortalClassInfo) {
    this.userMap = {}
    this.classInfo = classInfo
    if (!classInfo) {
      return
    }

    const addToMap = (user:PortalUser) => {
      this.userMap[user.id] = user
      this.userMap[escapeFirebaseKey(user.id)] = user
    }
    classInfo.students.forEach(addToMap)
    classInfo.teachers.forEach(addToMap)
  }

  lookup(userId:string) {
    return this.userMap[userId] || this.userMap[escapeFirebaseKey(userId)]
  }

  options() {
    const options:UserOptions[] = []
    const addOption = (user:PortalUser) => options.push({name: `${user.fullName} (${user.initials})`, value: user.id, key: user.id})
    if (this.classInfo) {
      this.classInfo.students.forEach(addOption)
      this.classInfo.teachers.forEach(addOption)
    }
    return options
  }
}