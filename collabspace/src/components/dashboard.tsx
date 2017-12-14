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
}

export class DashboardComponent extends React.Component<DashboardComponentProps, DashboardComponentState> {

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
      publication: null
    }
  }

  componentWillMount() {
    firebase.initializeApp(FirebaseConfig)

    dashboardAuth()
      .then((portalInfo) => {

        const {offering, user, tokens} = portalInfo
        if (!offering || !user) {
          throw new Error("Cannot find offering or user")
        }

        this.setState({portalOffering: offering, portalUser: user, portalTokens: tokens})

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
      .catch((error) => this.setState({error}))
  }

  renderError() {
    return <div className="error">{this.state.error.toString()}</div>
  }

  renderProgress(progress?:string) {
    return <div className="progress">{progress || this.state.progress}</div>
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
          publication={publication}
        />
      }

      return <DashboardTableComponent
          firebaseUser={firebaseUser}
          portalUser={portalUser}
          portalOffering={portalOffering}
          portalTokens={portalTokens}
        />
    }
    return this.renderProgress("Authenticating...")
  }
}

