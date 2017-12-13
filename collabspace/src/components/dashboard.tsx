import * as React from "react"
import * as firebase from "firebase"
import * as queryString from "query-string"
import * as jwt from "jsonwebtoken"
import { PortalJWT, getClassInfo, PortalClassInfo, PortalOffering, dashboardAuth, PortalUser, firebaseAuth } from "../lib/auth";
import { Document, FirebasePublication } from "../lib/document"
import { getDocumentPath, getPublicationsRef } from "../lib/refs"
import { FirebaseConfig } from "../lib/firebase-config"
import { WorkspaceComponent } from "./workspace"

const isDemo = require("../../functions/demo-info").demoInfo.isDemo

export interface DashboardQueryParameters {
  demo?: string
  token?: string|number
  jwtToken?: string
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
  document: Document|null
  firebasePublication: FirebasePublication|null
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
      document: null,
      firebasePublication: null
    }
  }

  componentWillMount() {
    firebase.initializeApp(FirebaseConfig)

    firebaseAuth().then((firebaseUser) => {

      this.setState({firebaseUser})

      const params:DashboardQueryParameters = queryString.parse(window.location.search)
      const {publication, jwtToken, demo} = params

      if (publication && jwtToken) {
        dashboardAuth(jwtToken, demo)
          .then(([portalOffering, portalUser]) => {

            this.setState({progress: "Loading publication...", portalOffering, portalUser})

            return getPublicationsRef(portalOffering, publication).once("value")
              .then((snapshot) => {
                const firebasePublication:FirebasePublication = snapshot.val()
                this.setState({firebasePublication})

                this.setState({progress: "Loading document..."})

                const {documentId} = firebasePublication
                Document.LoadDocumentFromFirebase(documentId, getDocumentPath(portalOffering, documentId))
                  .then((document) => {
                    document.isReadonly = true
                    this.setState({document, progress: null})
                  })
                  .catch((error) => this.setState({error}))
              })

          })
          .catch((error) => this.setState({error}))
      }
    })
  }

  renderError() {
    return <div className="error">{this.state.error.toString()}</div>
  }

  renderProgress(progress?:string) {
    return <div className="progress">{progress || this.state.progress}</div>
  }

  render() {
    const {error, progress, portalOffering, portalUser, firebaseUser, document, firebasePublication} = this.state

    if (error) {
      return this.renderError()
    }
    if (portalUser && firebaseUser && portalOffering && document && firebasePublication) {
      return <WorkspaceComponent
              isTemplate={false}
              portalUser={portalUser}
              portalOffering={portalOffering}
              portalTokens={null}
              firebaseUser={firebaseUser}
              document={document}
              setTitle={null}
              group={null}
              groupRef={null}
              publication={firebasePublication}
            />
    }
    return this.renderProgress("Authenticating...")
  }
}

