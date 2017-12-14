import { PortalClassInfo, PortalUserMap, PortalUser } from "./auth";
import escapeFirebaseKey from "../lib/escape-firebase-key"

export class UserLookup {
  userMap: PortalUserMap

  constructor (classInfo?:PortalClassInfo) {
    this.userMap = {}
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
}