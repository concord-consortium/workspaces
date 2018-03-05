import * as React from "react"
import * as firebase from "firebase"
import * as queryString from "query-string"
import { FirebaseDocument, Document, FirebaseDocumentInfo } from "../lib/document"
import { FirebaseWindows } from "../lib/window"
import { DocumentCrudComponent } from "./document-crud"
import { WorkspaceComponent } from "./workspace"
import { FirebaseConfig } from "../lib/firebase-config"
import { DemoComponent } from "./demo"
import { PortalUser, PortalOffering, collabSpaceAuth, firebaseAuth, PortalTokens, AuthQueryParams } from "../lib/auth"
import { getUserTemplatePath, getSupportsRef, getSupportsSeenRef } from "../lib/refs"
import { v4 as uuidV4 } from "uuid"
import { LogManager } from "../../../shared/log-manager"
import { JWTKeepalive } from "../lib/jwt-keepalive"

export const MAX_GROUPS = 99;

export interface AppComponentProps {}

export interface AppComponentState {
  firebaseUser: firebase.User|null
  authError: any|null
  documentError: any|null
  actionError: any|null
  documentId: string|null
  document: Document|null
  templateId: string|null
  template: Document|null
  demoId: string|null
  portalTokens: PortalTokens|null,
  portalUser: PortalUser|null,
  portalOffering: PortalOffering|null,
  groupChosen: boolean
  group: number
  groupRef: firebase.database.Reference|null
  supportsRef: firebase.database.Reference|null
  supportsSeenRef: firebase.database.Reference|null
}

export type HashActionParam = "create-template"

export interface AppHashParams {
  template: string|null
  demo?: string
}

export interface AppQueryParams {
  demo?: string
  token?: string|number
  domain?: string
  domain_uid?: string|number
  portalAction?: string
}

export class AppComponent extends React.Component<AppComponentProps, AppComponentState> {
  startingTitle: string
  logManager: LogManager
  jwtKeepalive: JWTKeepalive

  constructor (props:AppComponentProps) {
    super(props)

    this.state = {
      authError: null,
      documentError: null,
      actionError: null,
      firebaseUser: null,
      documentId: null,
      document: null,
      demoId: null,
      portalTokens: null,
      portalUser: null,
      portalOffering: null,
      groupChosen: false,
      group: 0,
      groupRef: null,
      supportsRef: null,
      supportsSeenRef: null,
      templateId: null,
      template: null,
    }
    this.startingTitle = document.title
  }

  refs: {
    group: HTMLSelectElement
  }

  componentWillMount() {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(FirebaseConfig)
    }

    collabSpaceAuth().then((portalInfo) => {
      const {tokens} = portalInfo

      this.setState({portalUser: portalInfo.user, portalOffering: portalInfo.offering, portalTokens: tokens})
      this.logManager = new LogManager({tokens, activity: "CollabSpace"})
      this.jwtKeepalive = new JWTKeepalive(tokens, (portalTokens, expired) => this.setState({portalTokens}))

      return firebaseAuth().then((firebaseUser) => {
        this.setState({firebaseUser})

        this.handleParseHash()
        window.addEventListener("hashchange", this.handleParseHash)

        this.handleParseQuery();
      })
    })
    .catch((error) => {
      this.setState({authError: `Unable to authenticate: ${error.toString().replace("Signature", "Access token")}`})
    })
  }

  handleSetTitle = (documentName?:string|null) => {
    const suffix = documentName ? `: ${documentName}` : ""
    document.title = this.startingTitle + suffix
  }

  handleParseQuery = () => {
    const params:AppQueryParams = queryString.parse(window.location.search)
    if (params.portalAction) {
      switch (params.portalAction) {
        case "authoring_launch":
          const {firebaseUser, portalTokens} = this.state
          if (firebaseUser && portalTokens) {
            const {uid} = firebaseUser
            const documentId = uuidV4()
            Document.CreateTemplateInFirebase(uid, documentId, portalTokens.domain)
              .then((document) => window.location.href = `?portalJWT=${portalTokens.rawPortalJWT}#template=${Document.StringifyTemplateHashParam(uid, documentId)}`)
              .catch((error) => this.setState({actionError: error}))
          }
          break
      }
    }
  }

  handleParseHash = () => {
    const params:AppHashParams = queryString.parse(window.location.hash)

    if (this.state.document) {
      this.state.document.destroy()
    }

    this.setState({
      templateId: params.template || null,
      documentError: null,
      document: null,
      demoId: params.demo || null
    })

    this.handleSetTitle()

    if (params.template) {
      const parsedParam = Document.ParseTemplateHashParam(params.template)
      if (parsedParam) {
        Document.LoadDocumentFromFirebase(parsedParam.templateId, getUserTemplatePath(parsedParam.ownerId, parsedParam.templateId))
          .then((template) => {
            const {firebaseUser} = this.state
            template.isReadonly = firebaseUser ? firebaseUser.uid !== template.ownerId : true
            this.setState({template, document: this.state.portalOffering ? null : template}, () => {
              const params:AuthQueryParams = queryString.parse(window.location.search)
              if (params.group) {
                this.selectGroup(params.group)
              }
            })
          })
          .catch((documentError) => this.setState({documentError}))
      }
      else {
        this.setState({documentError: "Invalid collaborative space template in url!"})
      }
    }
  }

  selectGroup(groupValue: string) {
    const group = parseInt(groupValue)
    if (group > 0) {
      this.setState({groupChosen: true, group})
      if (this.state.template && this.state.portalOffering) {
        this.state.template.getGroupOfferingDocument(this.state.portalOffering, group)
          .then(([document, groupRef]) => {
            const supportsRef = this.state.portalOffering ? getSupportsRef(this.state.portalOffering) : null;
            const supportsSeenRef = this.state.portalOffering && this.state.portalUser ? getSupportsSeenRef(this.state.portalOffering, this.state.portalUser.id) : null;
            this.setState({document, groupRef, supportsRef, supportsSeenRef})
          })
          .catch((documentError) => this.setState({documentError}))
        }
    }
  }

  handleChoseGroup = (e:React.ChangeEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (this.refs.group) {
      this.selectGroup(this.refs.group.value)
    }
  }

  handleLeaveGroup = () => {
    this.setState({groupChosen: false, group: 0, document: null})
  }

  renderChoseGroup() {
    const {portalUser} = this.state
    const items:JSX.Element[] = []
    for (let i=1; i <= MAX_GROUPS; i++) {
      items.push(<option value={i} key={i}>{i}</option>)
    }
    return (
      <form className="select-group" onSubmit={this.handleChoseGroup}>
        {portalUser ? <div className="welcome">Welcome {portalUser.fullName}</div> : null}
        <div>Please select your group</div>
        <div>
          <select ref="group">{items}</select>
          <input type="submit" value="Select" />
        </div>
      </form>
    )
  }

  renderFatalError(message:string, errorType:string) {
    return <div className="error">{errorType} Error: {message}</div>
  }

  renderProgress(message:string) {
    return <div className="progress">{message}</div>
  }

  render() {
    const error = this.state.authError || this.state.documentError || this.state.actionError
    if (error) {
      const errorType = error === this.state.authError ? "Authorization" : (error == this.state.documentError ? "Document" : "Action")
      return this.renderFatalError(error.toString(), errorType)
    }

    if (this.state.firebaseUser) {
      if (this.state.templateId) {
        if (this.state.template) {
          if (this.state.portalUser && this.state.portalOffering && this.state.portalTokens) {
            if (this.state.groupChosen) {
              if (this.state.document) {
                return <WorkspaceComponent
                  isTemplate={false}
                  portalUser={this.state.portalUser}
                  portalOffering={this.state.portalOffering}
                  portalTokens={this.state.portalTokens}
                  firebaseUser={this.state.firebaseUser}
                  document={this.state.document}
                  setTitle={null}
                  group={this.state.group}
                  groupRef={this.state.groupRef}
                  supportsRef={this.state.supportsRef}
                  supportsSeenRef={this.state.supportsSeenRef}
                  leaveGroup={this.handleLeaveGroup}
                  publication={null}
                  logManager={this.logManager}
                />
              }
              return this.renderProgress("Loading collaborative space group document...")
            }
            return this.renderChoseGroup()
          }

          if (this.state.demoId) {
            return <DemoComponent
                     firebaseUser={this.state.firebaseUser}
                     template={this.state.template}
                     demoId={this.state.demoId}
                   />
          }

          return <WorkspaceComponent
                    isTemplate={true}
                    portalUser={this.state.portalUser}
                    portalOffering={null}
                    portalTokens={this.state.portalTokens}
                    group={null}
                    groupRef={null}
                    supportsRef={null}
                    supportsSeenRef={null}
                    firebaseUser={this.state.firebaseUser}
                    document={this.state.template}
                    setTitle={this.handleSetTitle}
                    publication={null}
                    logManager={this.logManager}
                  />
        }
        return this.renderProgress("Loading collaborative space template...")
      }
      return <DocumentCrudComponent firebaseUser={this.state.firebaseUser} />
    }

    return this.renderProgress("Authenticating...")
  }
}