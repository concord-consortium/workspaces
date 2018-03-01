import {v4 as uuid} from "uuid"
import { assign } from "lodash"
import { PortalTokens, PortalFirebaseStudentJWT } from "../collabspace/src/lib/auth"
import * as firebase from "firebase"

export interface LogManagerSettings {
  endPoint: string
  application: string
  activity: string
  activityName: string
  username: string
  tokens: PortalTokens|null
  url: string
}
export type LogManagerOptions = Partial<LogManagerSettings>

export type LogManagerEventValue = string|boolean|number|null

export interface LogManagerData {
  application: string
  session: string
  username: string
  url: string
  run_key: string
  run_remote_id: string
  run_remote_endpoint: string|null
  activity: string
  activity_id: number
  activity_name: string
  page_id: number
  event: string
  event_value: LogManagerEventValue
  parameters: object
  interactive_id: number
  interactive_url: string
  time: number
}

export class LogManager {
  private logToConsole:boolean
  private settings:LogManagerSettings
  private session: string
  private runRemoteEndPoint: string|null
  private timeSkew: number

  constructor (options:LogManagerOptions) {
    const defaults:LogManagerSettings = {
      endPoint: "https://cc-log-manager.herokuapp.com/api/logs",
      application: "CollabSpace",
      activity: "n/a",
      activityName: "n/a",
      username: "n/a",
      tokens: null,
      url: window.location.href
    }
    this.runRemoteEndPoint = null
    this.setSettings(options, defaults)
    this.session = uuid()

    // this assumes the log manager is created after firebase is setup
    this.timeSkew = 0
    const offsetRef = firebase.database().ref(".info/serverTimeOffset")
    offsetRef.on("value", (snapshot) => {
      this.timeSkew = snapshot ? snapshot.val() : 0
    })

    // allow for easy debugging
    this.logToConsole = window.location.search.toLowerCase().indexOf("logtoconsole") !== -1
  }

  setSettings(options:LogManagerOptions, defaults?:LogManagerOptions) {
    this.settings = assign({}, defaults, options, this.settings)
    const {tokens} = this.settings
    if (tokens && (tokens.portalJWT.user_type === "learner")) {
      this.runRemoteEndPoint = (tokens.firebaseJWT as PortalFirebaseStudentJWT).returnUrl
    }
  }

  logEvent(eventName:string, eventValue:LogManagerEventValue, parameters:any|null) {
    const now = Date.now() + this.timeSkew,
          {session, runRemoteEndPoint} = this,
          {application, username, activity, activityName, url} = this.settings,
          data:LogManagerData = {
            application,
            session,
            username,
            activity,
            url,
            run_key: "n/a",
            run_remote_id: "n/a",
            run_remote_endpoint: runRemoteEndPoint,
            activity_id: 0,
            activity_name: activityName,
            page_id: 0,
            event: eventName,
            event_value: eventValue,
            parameters,
            interactive_id: 0,
            interactive_url: url,
            time: now
          },
          xhr = new XMLHttpRequest()

    if (this.runRemoteEndPoint) {
      xhr.open("POST", this.settings.endPoint, true)
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify(data))

      if (this.logToConsole) {
        console.log(`LOG MANAGER: ${eventName} (value: ${eventValue}) (parameters: ${JSON.stringify(parameters)})`)
      }
    }
    else if (!this.settings.tokens) {
      console.info("Not logging as JWT tokens are not set!")
    }
  }
}