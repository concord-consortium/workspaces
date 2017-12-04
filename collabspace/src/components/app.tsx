import * as React from "react"
import * as firebase from "firebase"
import * as queryString from "query-string"
import { FirebaseDocument, Document, FirebaseDocumentInfo } from "../lib/document"
import { FirebaseWindows } from "../lib/window"
import { DocumentCrudComponent } from "./document-crud"
import { WorkspaceComponent } from "./workspace"
import { FirebaseConfig } from "../lib/firebase-config"
import { DemoComponent } from "./demo"
import { PortalUser, PortalActivity, portalAuth, firebaseAuth } from "../lib/auth"
import { getUserTemplatePath } from "../lib/refs"

export interface AppComponentProps {}

export interface AppComponentState {
  firebaseUser: firebase.User|null
  authError: any|null
  documentError: any|null
  documentId: string|null
  document: Document|null
  templateId: string|null
  template: Document|null
  demoId: string|null
  portalUser: PortalUser|null,
  portalActivity: PortalActivity|null,
  groupChosen: boolean
  group: number
  groupRef: firebase.database.Reference|null
}

export interface AppHashParams {
  template: string|null
  demo?: string
}

export interface AppQueryParams {
  demo?: string
  token?: string|number
  domain?: string
  domain_uid?: string|number
}

export class AppComponent extends React.Component<AppComponentProps, AppComponentState> {
  startingTitle: string

  constructor (props:AppComponentProps) {
    super(props)
    this.state = {
      authError: null,
      documentError: null,
      firebaseUser: null,
      documentId: null,
      document: null,
      demoId: null,
      portalUser: null,
      portalActivity: null,
      groupChosen: false,
      group: 0,
      groupRef: null,
      templateId: null,
      template: null
    }
    this.startingTitle = document.title
    this.setTitle = this.setTitle.bind(this)
    this.handleChoseGroup = this.handleChoseGroup.bind(this)
    this.leaveGroup = this.leaveGroup.bind(this)
  }

  refs: {
    group: HTMLSelectElement
  }

  componentWillMount() {
    firebase.initializeApp(FirebaseConfig)

    portalAuth().then((portalInfo) => {
      this.setState({portalUser: portalInfo.user, portalActivity: portalInfo.activity})

      return firebaseAuth().then((firebaseUser) => {
        this.setState({firebaseUser})

        this.parseHash()
        window.addEventListener("hashchange", this.parseHash.bind(this))
      })
    })
    .catch((error) => {
      this.setState({authError: error})
    })
  }

  setTitle(documentName?:string|null) {
    const suffix = documentName ? `: ${documentName}` : ""
    document.title = this.startingTitle + suffix
  }

  parseHash() {
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

    this.setTitle()

    if (params.template) {
      const parsedParam = Document.ParseTemplateHashParam(params.template)
      if (parsedParam) {
        Document.LoadDocumentFromFirebase(parsedParam.templateId, getUserTemplatePath(parsedParam.ownerId, parsedParam.templateId))
          .then((template) => {
            const {firebaseUser} = this.state
            template.isReadonly = firebaseUser ? firebaseUser.uid !== template.ownerId : true
            this.setState({template, document: this.state.portalActivity ? null : template})
          })
          .catch((documentError) => this.setState({documentError}))
      }
      else {
        this.setState({documentError: "Invalid collaborative space template in url!"})
      }
    }
  }

  handleChoseGroup(e:React.ChangeEvent<HTMLFormElement>) {
    e.preventDefault()
    if (this.refs.group) {
      const group = parseInt(this.refs.group.value)
      if (group > 0) {
        this.setState({groupChosen: true, group})
        if (this.state.template && this.state.portalActivity) {
          this.state.template.getGroupActivityDocument(this.state.portalActivity, group)
            .then(([document, groupRef]) => {
              this.setState({document, groupRef})
            })
            .catch((documentError) => this.setState({documentError}))
          }
      }
    }
  }

  leaveGroup() {
    this.setState({groupChosen: false, group: 0, document: null})
  }

  renderChoseGroup() {
    const {portalUser} = this.state
    const items:JSX.Element[] = []
    for (let i=1; i <= 99; i++) {
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
    const error = this.state.authError || this.state.documentError
    if (error) {
      const errorType = error === this.state.authError ? "Authorization" : "Document"
      return this.renderFatalError(error.toString(), errorType)
    }

    if (this.state.firebaseUser) {
      if (this.state.templateId) {
        if (this.state.template) {
          if (this.state.portalUser && this.state.portalActivity) {
            if (this.state.groupChosen) {
              if (this.state.document) {
                return <WorkspaceComponent
                  isTemplate={false}
                  portalUser={this.state.portalUser}
                  portalActivity={this.state.portalActivity}
                  firebaseUser={this.state.firebaseUser}
                  document={this.state.document}
                  setTitle={null}
                  group={this.state.group}
                  groupRef={this.state.groupRef}
                  leaveGroup={this.leaveGroup}
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
                    portalUser={null}
                    portalActivity={null}
                    group={null}
                    groupRef={null}
                    firebaseUser={this.state.firebaseUser}
                    document={this.state.template}
                    setTitle={this.setTitle}
                 />
        }
        return this.renderProgress("Loading collaborative space template...")
      }
      return <DocumentCrudComponent firebaseUser={this.state.firebaseUser} />
    }

    return this.renderProgress("Authenticating...")
  }
}