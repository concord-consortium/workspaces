import { AuthQueryParams, PortalTokens, getPortalJWTWithBearerToken, getFirebaseJWTWithBearerToken } from "./auth"
import * as queryString from "query-string"

export type JWTKeepaliveCallback = (tokens:PortalTokens, expired: boolean, error: string|null) => void

const seconds = (n:number) => n * 1000
const minutes = (n:number) => seconds(n) * 60
const now = () => Date.now()

const REFRESH_TIMEOUT = minutes(30)
const DURATION_BEFORE_IDLE_CHECK = minutes(60)
const MAX_IDLE_DURATION = minutes(10)
const MAX_DURATION = minutes(120)

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
      this.callback(tokens, true, "Your session has reached its maximum length.  Please login again.")
      return
    }

    if (this.startedAt + DURATION_BEFORE_IDLE_CHECK < rightNow) {
      if (this.idle && (rightNow - this.idleAt > MAX_IDLE_DURATION)) {
        this.callback(tokens, true, "Your session has been idle for too long.  Please login again.")
        return
      }
    }

    getPortalJWTWithBearerToken(tokens.firebaseJWT.domain, "Bearer/JWT", tokens.rawPortalJWT, params.demo)
      .then(([rawPortalJWT, portalJWT]) => {
        const {rawFirebaseJWT, firebaseJWT, domain} = tokens
        const newTokens:PortalTokens = {
          rawPortalJWT,
          portalJWT,
          rawFirebaseJWT,
          firebaseJWT,
          domain
        }
        this.callback(newTokens, false, null)
      })
      .catch((err) => {
        this.callback(tokens, true, "Unable to automatically refresh your login.  Please manually login again.")
      })
    this.startJWTRefreshTimer()
  }
}