import * as React from "react"
import * as firebase from "firebase"
import * as queryString from "query-string"
import * as jwt from "jsonwebtoken"
import { PortalJWT, getClassInfo, PortalClassInfo, PortalOffering } from "../lib/auth";
import { Document, FirebasePublication } from "../lib/document"
import { getDocumentPath, getPublicationsRef } from "../lib/refs"
import { FirebaseConfig } from "../lib/firebase-config"
import { DashboardDocumentComponent } from "./dashboard-document"

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
  error: any|null
  progress: string|null
  params: DashboardQueryParameters
  portalJWT: PortalJWT|null
  classInfo: PortalClassInfo|null
  portalOffering: PortalOffering|null
  document: Document|null
  firebasePublication: FirebasePublication|null
}

export class DashboardComponent extends React.Component<DashboardComponentProps, DashboardComponentState> {

  constructor (props:DashboardComponentProps) {
    super(props);
    this.state = {
      error: null,
      progress: "Loading...",
      params: {},
      portalJWT: null,
      classInfo: null,
      portalOffering: null,
      document: null,
      firebasePublication: null
    }
  }

  componentWillMount() {
    firebase.initializeApp(FirebaseConfig)

    const params:DashboardQueryParameters = queryString.parse(window.location.search)
    const portalJWT:PortalJWT|null = params.jwtToken ? jwt.decode(params.jwtToken) as PortalJWT : null
    this.setState({
      params,
      portalJWT
    })

    const {publication, jwtToken, demo} = params

    if (publication && jwtToken && portalJWT && portalJWT.user_type === "learner") {
      this.setState({progress: "Loading class info..."})

      const classInfoUrl = `${portalJWT.class_info_url}${isDemo(portalJWT.class_info_url) && demo ? `?demo=${demo}` : ""}`
      getClassInfo(classInfoUrl, jwtToken)
        .then((classInfo) => {

          const portalOffering:PortalOffering = {
            id: portalJWT.offering_id,
            domain: portalJWT.domain,
            classInfo,
            isDemo
          }

          this.setState({classInfo, portalOffering})

          this.setState({progress: "Loading publication..."})

          return getPublicationsRef(portalOffering, publication).once("value")
            .then((snapshot) => {
              const firebasePublication:FirebasePublication = snapshot.val()
              this.setState({firebasePublication})

              this.setState({progress: "Loading document..."})

              const {documentId} = firebasePublication
              Document.LoadDocumentFromFirebase(documentId, getDocumentPath(portalOffering, documentId))
                .then((document) => this.setState({document, progress: null}))
                .catch((error) => this.setState({error}))
            })
        })
        .catch((error) => this.setState({error}))
    }
  }

  renderDocument() {
    const {portalOffering, document, firebasePublication} = this.state
    if (!portalOffering || !document || !firebasePublication) {
      return null
    }
  }

  renderDebugInfo() {
    const {params} = this.state
    if (params.token) {
      return <div>Showing dashboard for teacher</div>
    }
    return <div>Unknown parameters!</div>
  }

  renderError() {
    return <div className="error">{this.state.error}</div>
  }

  renderProgress() {
    return <div className="progress">{this.state.progress}</div>
  }

  render() {
    const {error, progress, portalOffering, document, firebasePublication} = this.state

    if (error) {
      return this.renderError()
    }
    if (progress) {
      return this.renderProgress()
    }
    if (portalOffering && document && firebasePublication) {
      return <DashboardDocumentComponent
                portalOffering={portalOffering}
                document={document}
                firebasePublication={firebasePublication}
             />
    }
    return null
  }
}

