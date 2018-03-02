import * as React from "react"
import * as firebase from "firebase"
import * as queryString from "query-string"
import * as jwt from "jsonwebtoken"
import { PortalJWT, getClassInfo, PortalClassInfo, PortalOffering, dashboardAuth, PortalUser, firebaseAuth, AuthQueryParams, PortalTokens } from "../lib/auth";
import { Document, FirebasePublication } from "../lib/document"
import { getDocumentPath, getPublicationsRef } from "../lib/refs"
import { FirebaseConfig } from "../lib/firebase-config"
import { WorkspaceComponent } from "./workspace"
import { DashboardTableComponent } from "./dashboard-table"
import { DashboardSuportComponent } from "./dashboard-support"
import { GroupListComponent } from "./group-list"
import { LogManager } from "../../../shared/log-manager"

export interface DashboardQueryParams extends AuthQueryParams {
  document?: string
  publication?: string
  offering?: string
}

export interface DashboardComponentProps {
}

export interface DashboardComponentState {
  firebaseUser: firebase.User|null
  error: any|null
  progress: string|null
  portalOffering: PortalOffering|null
  portalUser: PortalUser|null
  portalTokens: PortalTokens|null
  document: Document|null
  publication: FirebasePublication|null
  view: "publications" | "support" | "groups" | "poster"
  isTeacher: boolean
}

export class DashboardComponent extends React.Component<DashboardComponentProps, DashboardComponentState> {
  logManager: LogManager

  constructor (props:DashboardComponentProps) {
    super(props);
    this.state = {
      firebaseUser: null,
      error: null,
      progress: "Loading...",
      portalOffering: null,
      portalUser: null,
      portalTokens: null,
      document: null,
      publication: null,
      view: "publications",
      isTeacher: false
    }
  }

  componentWillMount() {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(FirebaseConfig)
    }

    dashboardAuth()
      .then((portalInfo) => {

        const {offering, user, tokens} = portalInfo
        if (!offering || !user) {
          throw new Error("Cannot find offering or user")
        }

        this.logManager = new LogManager({tokens, activity: "CollabSpace:Dashboard"})

        const isTeacher = user.type === "teacher"
        this.setState({portalOffering: offering, portalUser: user, portalTokens: tokens, isTeacher})

        return firebaseAuth().then((firebaseUser) => {
          this.setState({firebaseUser})

          const params:DashboardQueryParams = queryString.parse(window.location.search)
          if (params.publication) {
            this.setState({progress: "Loading publication..."})

            return getPublicationsRef(offering, params.publication).once("value")
              .then((snapshot) => {
                const publication:FirebasePublication = snapshot.val()
                this.setState({publication})

                this.setState({progress: "Loading document..."})

                const {documentId} = publication
                Document.LoadDocumentFromFirebase(documentId, getDocumentPath(offering, documentId))
                  .then((document) => {
                    document.isReadonly = true
                    this.setState({document, progress: null})
                  })
                  .catch((error) => this.setState({error}))
              })
          }
          else {
            this.setState({progress: null})
          }
        })
      })
      .catch((error) => this.setState({error: `Unable to authenticate: ${error.toString().replace("Signature", "Access token")}`}))
  }

  renderError() {
    return <div className="error">{this.state.error.toString()}</div>
  }

  renderProgress(progress?:string) {
    return <div className="progress">{progress || this.state.progress}</div>
  }

  renderHeader(firebaseUser: firebase.User, portalUser: PortalUser, portalOffering: PortalOffering) {
    const {classInfo} = portalOffering
    const userName = portalUser ? portalUser.fullName : (firebaseUser.isAnonymous ? "Anonymous User" : firebaseUser.displayName)
    return (
      <div className="header">
        <div className="document-info">
          <div className="document-name">
            {classInfo.name}
          </div>
          <div className="instance-info" >Dashboard</div>
        </div>
        <div className="user-info">
          <div className="user-name" title={firebaseUser.uid}>{userName}</div>
        </div>
      </div>
    )
  }

  renderToolbar() {
    //<button type="button" onClick={() => this.setState({view: "poster"})}>Poster View</button>
    return (
      <div className="toolbar">
        <div className="buttons">
          <div className="left-buttons">
            <button type="button" onClick={() => this.setState({view: "publications"})}>Publications</button>
            {this.state.isTeacher ? <button type="button" onClick={() => this.setState({view: "groups"})}>Groups</button> : null}
            {this.state.isTeacher ? <button type="button" onClick={() => this.setState({view: "support"})}>Support</button> : null}
          </div>
        </div>
      </div>
    )
  }

  render() {
    const {error, progress, portalOffering, portalUser, portalTokens, firebaseUser, document, publication} = this.state

    if (error) {
      return this.renderError()
    }
    if (this.state.progress) {
      return this.renderProgress()
    }
    if (portalUser && firebaseUser && portalOffering && portalTokens) {
      if (document && publication) {
        return <WorkspaceComponent
          isTemplate={false}
          portalUser={portalUser}
          portalOffering={portalOffering}
          portalTokens={portalTokens}
          firebaseUser={firebaseUser}
          document={document}
          setTitle={null}
          group={null}
          groupRef={null}
          supportsRef={null}
          supportsSeenRef={null}
          publication={publication}
          logManager={this.logManager}
        />
      }

      let workspace:JSX.Element|null = null

      switch (this.state.view) {
        case "publications":
          workspace = <DashboardTableComponent
            firebaseUser={firebaseUser}
            portalUser={portalUser}
            portalOffering={portalOffering}
            portalTokens={portalTokens}
          />
          break

        case "support":
          workspace = <DashboardSuportComponent
            firebaseUser={firebaseUser}
            portalUser={portalUser}
            portalOffering={portalOffering}
            portalTokens={portalTokens}
          />
          break

        case "groups":
          workspace = <GroupListComponent
            firebaseUser={firebaseUser}
            portalUser={portalUser}
            portalOffering={portalOffering}
            portalTokens={portalTokens}
          />
          break

        case "poster":
          // TODO
          return null
      }

      return (
        <div className="dashboard">
          {this.renderHeader(firebaseUser, portalUser, portalOffering)}
          {this.renderToolbar()}
          {workspace}
        </div>
      )

    }
    return this.renderProgress("Authenticating...")
  }
}

