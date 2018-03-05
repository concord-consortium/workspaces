import { AuthQueryParams, PortalTokens, getPortalJWTWithBearerToken, getFirebaseJWTWithBearerToken } from "./auth"
import * as queryString from "query-string"

export type JWTKeepaliveCallback = (tokens:PortalTokens, expired: boolean) => void

const seconds = (n:number) => n * 1000
const minutes = (n:number) => seconds(n) * 60
const now = () => Date.now()

const REFRESH_TIMEOUT = minutes(1)
const DURATION_BEFORE_IDLE_CHECK = minutes(3)
const MAX_IDLE_DURATION = minutes(1)
const MAX_DURATION = minutes(10)

export class JWTKeepalive {
  private tokens: PortalTokens|null
  private callback: JWTKeepaliveCallback
  private idleTimeout: number
  private idle: boolean
  private idleAt: number
  private startedAt: number

  constructor (tokens: PortalTokens|null, callback: JWTKeepaliveCallback) {
    this.tokens = tokens
    this.callback = callback
    this.startedAt = now()

    if (tokens) {
      this.idle = false
      this.startListeners()
      this.startIdleTimer()
      this.startJWTRefreshTimer()
    }
  }

  startListeners() {
    window.addEventListener("mousemove", this.resetIdleTimer, false);
    window.addEventListener("mousedown", this.resetIdleTimer, false);
    window.addEventListener("keypress", this.resetIdleTimer, false);
    window.addEventListener("DOMMouseScroll", this.resetIdleTimer, false);
    window.addEventListener("mousewheel", this.resetIdleTimer, false);
    window.addEventListener("touchmove", this.resetIdleTimer, false);
    window.addEventListener("MSPointerMove", this.resetIdleTimer, false);
  }

  startIdleTimer() {
    this.idleTimeout = window.setTimeout(this.goIdle, seconds(5))
  }

  goIdle = () => {
    if (!this.idle) {
      this.idle = true
      this.idleAt = now()
    }
  }

  goActive = () => {
    this.idle = false
    this.startIdleTimer()
  }

  resetIdleTimer = () => {
    window.clearTimeout(this.idleTimeout)
    this.goActive()
  }

  startJWTRefreshTimer() {
    window.setTimeout(this.refreshTokens, REFRESH_TIMEOUT)
  }

  refreshTokens = () => {
    const rightNow = now()
    const {tokens} = this
    const params:AuthQueryParams = queryString.parse(window.location.search)

    if (!tokens) {
      return
    }

    if (this.startedAt + MAX_DURATION < rightNow) {
      console.log("Reached max duration, stopping")
      this.callback(tokens, true)
      return
    }

    if (this.startedAt + DURATION_BEFORE_IDLE_CHECK < rightNow) {
      console.log("Reached idle check duration")
      if (this.idle && (rightNow - this.idleAt > MAX_IDLE_DURATION)) {
        console.log("Idle for too long during check, stopping")
        this.callback(tokens, true)
        return
      }
    }

    console.log("refreshing tokens")
    getPortalJWTWithBearerToken(tokens.firebaseJWT.domain, "Bearer/JWT", tokens.rawPortalJWT, params.demo)
      .then(([rawPortalJWT, portalJWT]) => {
      })
      .catch((err) => {

      })
    this.startJWTRefreshTimer()
  }
}