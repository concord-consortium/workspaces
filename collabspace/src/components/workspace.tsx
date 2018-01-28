import * as React from "react"
import * as firebase from "firebase"
import * as queryString from "query-string"
import * as superagent from "superagent"

import { FirebaseDocumentInfo, Document, FirebasePublication, FirebaseArtifact, FirebasePublicationWindowMap, FirebaseDocument } from "../lib/document"
import { Window, FirebaseWindowAttrs, FirebaseWindowAttrsMap } from "../lib/window"
import { WindowComponent } from "./window"
import { MinimizedWindowComponent } from "./minimized-window"
import { InlineEditorComponent } from "./inline-editor"
import { SidebarComponent } from "./sidebar"
import { WindowManager, WindowManagerState, DragType } from "../lib/window-manager"
import { v4 as uuidV4} from "uuid"
import { PortalUser, PortalOffering, PortalUserConnectionStatusMap, PortalUserConnected, PortalUserDisconnected, PortalTokens, AuthQueryParams } from "../lib/auth"
import { AppHashParams } from "./app"
import escapeFirebaseKey from "../lib/escape-firebase-key"
import { getDocumentPath, getPublicationsRef, getArtifactsPath, getPublicationsPath, getArtifactsStoragePath } from "../lib/refs"
import { WorkspaceClientPublishRequest, WorkspaceClientPublishRequestMessage } from "../../../shared/workspace-client"
import { UserLookup } from "../lib/user-lookup"

const timeago = require("timeago.js")
const timeagoInstance = timeago()

export interface WorkspaceComponentProps {
  portalUser: PortalUser|null
  firebaseUser: firebase.User
  portalOffering: PortalOffering|null
  portalTokens: PortalTokens|null
  document: Document
  setTitle: ((documentName?:string|null) => void)|null
  isTemplate: boolean
  groupRef: firebase.database.Reference|null
  group: number|null
  leaveGroup?: () => void
  publication: FirebasePublication|null
}
export interface WorkspaceComponentState extends WindowManagerState {
  documentInfo: FirebaseDocumentInfo|null
  workspaceName: string
  debugInfo: string
  groupUsers: PortalUserConnectionStatusMap|null
  viewArtifact: FirebaseArtifact|null
  publishing: boolean
}

export class WorkspaceComponent extends React.Component<WorkspaceComponentProps, WorkspaceComponentState> {
  infoRef: firebase.database.Reference
  connectedRef: firebase.database.Reference|null
  userRef: firebase.database.Reference|null
  groupUsersRef: firebase.database.Reference|null
  windowManager: WindowManager
  userOnDisconnect: firebase.database.OnDisconnect|null
  userLookup: UserLookup

  constructor (props:WorkspaceComponentProps) {
    super(props)

    const {portalOffering} = props

    this.userLookup = new UserLookup(portalOffering ? portalOffering.classInfo : undefined)

    this.state = {
      documentInfo: null,
      allOrderedWindows: [],
      minimizedWindows: [],
      topWindow: null,
      workspaceName: this.getWorkspaceName(portalOffering),
      debugInfo: portalOffering ? `Class ID: ${portalOffering.classInfo.classHash}` : "",
      groupUsers: null,
      viewArtifact: null,
      publishing: false
    }
  }

  getWorkspaceName(portalOffering:PortalOffering|null) {
    if (!portalOffering) {
      return "Template"
    }
    const {classInfo, isDemo} = portalOffering
    const teacherNames = classInfo.teachers.map((teacher) => isDemo ? teacher.fullName : teacher.lastName)
    const domain = isDemo ? "" : `: ${portalOffering.domain}`
    return `${classInfo.name}: ${teacherNames.join(" & ")}${domain}`
  }

  componentWillMount() {
    this.windowManager = new WindowManager({
      document: this.props.document,
      onStateChanged: (newState) => {
        this.setState(newState)
      },
      syncChanges: this.props.isTemplate
    })

    this.infoRef = this.props.document.ref.child("info")
    this.infoRef.on("value", this.handleInfoChange)

    const {groupRef, portalUser} = this.props
    if (groupRef) {
      this.groupUsersRef = groupRef.child("users")
      this.groupUsersRef.on("value", this.handleGroupUsersChange)

      if (portalUser) {
        this.userRef = this.groupUsersRef.child(escapeFirebaseKey(portalUser.id))
        this.connectedRef = firebase.database().ref(".info/connected")
        this.connectedRef.on("value", this.handleConnected)
      }
    }

    window.addEventListener("mousedown", this.handleWindowMouseDown)
    window.addEventListener("mousemove", this.handleWindowMouseMove, true)
    window.addEventListener("mouseup", this.handleWindowMouseUp, true)
  }

  componentWillUnmount() {
    this.windowManager.destroy()

    if (this.userRef) {
      this.userOnDisconnect && this.userOnDisconnect.cancel()
      const disconnected:PortalUserDisconnected = {
        connected: false,
        disconnectedAt: firebase.database.ServerValue.TIMESTAMP
      }
      this.userRef.set(disconnected)
    }

    this.infoRef.off("value", this.handleInfoChange)
    this.connectedRef && this.connectedRef.off("value", this.handleConnected)
    this.groupUsersRef && this.groupUsersRef.off("value", this.handleGroupUsersChange)

    window.removeEventListener("mousedown", this.handleWindowMouseDown)
    window.removeEventListener("mousemove", this.handleWindowMouseMove, true)
    window.removeEventListener("mouseup", this.handleWindowMouseUp, true)
  }

  handleToggleViewArtifact = (artifact: FirebaseArtifact) => {
    this.setState({viewArtifact: artifact === this.state.viewArtifact ? null : artifact})
  }

  handleClearViewArtifact = () => {
    this.setState({viewArtifact: null})
  }

  handleConnected = (snapshot:firebase.database.DataSnapshot|null) => {
    if (snapshot && snapshot.val() && this.userRef) {
      const connected:PortalUserConnected = {
        connected: true,
        connectedAt: firebase.database.ServerValue.TIMESTAMP
      }
      const disconnected:PortalUserDisconnected = {
        connected: false,
        disconnectedAt: firebase.database.ServerValue.TIMESTAMP
      }
      this.userOnDisconnect = this.userRef.onDisconnect()
      this.userOnDisconnect.set(disconnected)
      this.userRef.set(connected)
    }
  }

  handleGroupUsersChange = (snapshot:firebase.database.DataSnapshot|null) => {
    if (snapshot && this.groupUsersRef) {
      const groupUsers:PortalUserConnectionStatusMap|null = snapshot.val()
      this.setState({groupUsers})
    }
  }

  handleInfoChange = (snapshot:firebase.database.DataSnapshot|null) => {
    if (snapshot) {
      const documentInfo:FirebaseDocumentInfo|null = snapshot.val()
      this.setState({documentInfo})
      if (this.props.setTitle) {
        this.props.setTitle(documentInfo ? documentInfo.name : null)
      }
    }
  }

  handleWindowMouseDown = (e:MouseEvent) => {
    const {dragInfo} = this.windowManager
    const windowProps = dragInfo.window && dragInfo.window.attrs
    if (windowProps) {
      dragInfo.starting = {
        x: e.clientX,
        y: e.clientY,
        top: windowProps.top,
        left: windowProps.left,
        width: windowProps.width,
        height: windowProps.height
      }
    }
  }

  handleWindowMouseMove = (e:MouseEvent) => {
    const {dragInfo} = this.windowManager
    if (dragInfo.type !== DragType.None) {
      e.preventDefault()
      e.stopPropagation()
      const {starting} = dragInfo
      const newWindowProps = dragInfo.window && dragInfo.window.attrs
      if (newWindowProps && starting) {
        const [dx, dy] = [e.clientX - starting.x, e.clientY - starting.y]
        switch (dragInfo.type) {
          case DragType.Position:
            newWindowProps.top = Math.max(0, starting.top + dy)
            newWindowProps.left = Math.max(0, starting.left + dx)
            break
          case DragType.GrowLeft:
            newWindowProps.left = Math.max(0, starting.left + dx)
            newWindowProps.width = starting.width - dx
            break
          case DragType.GrowUp:
            newWindowProps.top = Math.max(0, starting.top + dy)
            newWindowProps.height = starting.height - dy
            break
          case DragType.GrowRight:
            newWindowProps.width = starting.width + dx
            break
          case DragType.GrowDown:
            newWindowProps.height = starting.height + dy
            break
          case DragType.GrowDownLeft:
            newWindowProps.left = Math.max(0, starting.left + dx)
            newWindowProps.width = starting.width - dx
            newWindowProps.height = starting.height + dy
            break
          case DragType.GrowDownRight:
            newWindowProps.width = starting.width + dx
            newWindowProps.height = starting.height + dy
            break
        }
        this.windowManager.updateDragWindow(newWindowProps)
      }
    }
  }

  handleWindowMouseUp = (e:MouseEvent) => {
    const {dragInfo} = this.windowManager
    if (dragInfo.type !== DragType.None) {
      e.preventDefault()
      e.stopPropagation()
      this.windowManager.registerDragWindow(null, DragType.None)
    }
  }

  handleChangeDocumentName = (newName: string) => {
    if (this.state.documentInfo) {
      this.state.documentInfo.name = newName
      this.infoRef.set(this.state.documentInfo)
    }
  }

  handleDragOver = (e:React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  handleDrop = (e:React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const [url, ...rest] = e.dataTransfer.getData("text/uri-list").split("\n")
    if (url) {
      this.windowManager.add(url, "Untitled")
    }
  }

  constructRelativeUrl(filename:string) {
    const {location} = window
    return `${location.origin}${location.pathname}${filename}`
  }

  handleAddDrawingButton = () => {
    const title = (prompt("Enter the title of the drawing", "Untitled Drawing") || "").trim()
    if (title.length > 0) {
      this.windowManager.add(this.constructRelativeUrl("drawing-tool-v2.html"), title)
    }
  }

  handleAddCaseTable = () => {
    const title = (prompt("Enter the title of the table", "Untitled Table") || "").trim()
    if (title.length > 0) {
      this.windowManager.add(this.constructRelativeUrl("neo-codap.html?mode=table"), title)
    }
  }

  handleAddCaseTableAndGraph = () => {
    const title = (prompt("Enter the title of the table and graph", "Untitled Table/Graph") || "").trim()
    if (title.length > 0) {
      this.windowManager.add(this.constructRelativeUrl("neo-codap.html"), title)
    }
  }

  handleCreateDemoButton = () => {
    const hashParams:AppHashParams = {
      template: this.props.document.getTemplateHashParam(),
      demo: uuidV4()
    }
    window.open(`#${queryString.stringify(hashParams)}`)
  }

  handleSyncLocalWindowState = (firebaseDocument:FirebaseDocument) => {
    if (firebaseDocument.data && firebaseDocument.data.windows) {
      const {windows} = firebaseDocument.data
      if (windows.attrs) {
        Object.keys(windows.attrs).forEach((windowId) => {
          const localWindow = this.windowManager.windows[windowId]
          if (localWindow) {
            windows.attrs[windowId] = localWindow.attrs
          }
        })
      }
      windows.order = this.windowManager.arrayToFirebaseOrderMap(this.windowManager.windowOrder)
      windows.minimizedOrder = this.windowManager.arrayToFirebaseOrderMap(this.windowManager.minimizedWindowOrder)
    }
  }

  handlePublishButton = () => {
    const {groupUsers} = this.state
    const {portalOffering, portalUser, groupRef, group} = this.props
    if (!groupUsers || !portalOffering || !portalUser || (portalUser.type === "teacher") || !groupRef || !group) {
      return
    }

    const donePublishing = (err?:any) => {
      this.setState({publishing: false})
      if (err) {
        alert(err.toString())
      }
    }

    this.setState({publishing: true})

    // copy the doc with local window state
    this.props.document.copy(getDocumentPath(portalOffering), this.handleSyncLocalWindowState)
      .then((document) => {

        // open the doc to get the windows
        document.dataRef.child("windows/attrs").once("value")
          .then((snapshot) => {
            const attrsMap:FirebaseWindowAttrsMap = snapshot.val() || {}
            const windows:FirebasePublicationWindowMap = {}
            Object.keys(attrsMap).forEach((windowId) => {
              const attrs = attrsMap[windowId]
              if (attrs) {
                windows[windowId] = {
                  title: attrs.title,
                  artifacts: {}
                }
              }
            })

            // then create the publication
            const publication:FirebasePublication = {
              offeringId: portalOffering.id,
              group: group,
              creator: portalUser.id,
              groupMembers: groupUsers,
              createdAt: firebase.database.ServerValue.TIMESTAMP,
              documentId: document.id,
              windows: windows
            }

            const publicationRef = getPublicationsRef(portalOffering).push(publication)
            const publicationId = publicationRef.key
            if (publicationId) {

              // and finally tell all the child windows so they can generate artifacts
              const publishRequest:WorkspaceClientPublishRequest = {
                publicationsPath: getPublicationsPath(portalOffering, publicationId),
                artifactStoragePath: getArtifactsStoragePath(portalOffering, publicationId)
              }
              this.windowManager.postToAllWindows(
                WorkspaceClientPublishRequestMessage,
                publishRequest
              )
            }

            donePublishing()
          })
          .catch(donePublishing)
      })
      .catch(donePublishing)
  }

  handlePromptToChangeGroup = () => {
    if (this.props.leaveGroup && confirm("Do you want to change your group?")) {
      this.props.leaveGroup()
    }
  }

  handleViewAllPublications = () => {
    const {portalTokens} = this.props
    if (!portalTokens) {
      return
    }
    const {portalJWT, rawPortalJWT} = portalTokens

    const params:AuthQueryParams = queryString.parse(window.location.search)

    let newParams:AuthQueryParams = {}
    if (portalJWT.user_type === "learner") {
      newParams = {
        portalJWT: rawPortalJWT
      }
    }
    else {
      const {classInfoUrl, offeringId} = params
      if (!classInfoUrl || !offeringId) {
        alert("Missing classInfoUrl or offeringId in params!")
        return
      }
      newParams = {
        portalJWT: rawPortalJWT,
        classInfoUrl,
        offeringId
      }
    }

    if (params.demo) {
      newParams.demo = params.demo
    }

    window.location.href = `?${queryString.stringify(newParams)}`
  }

  handleCreateActivityButton = () => {
    const {documentInfo} = this.state
    const {portalTokens, firebaseUser, document} = this.props
    if (documentInfo && documentInfo.portalUrl && portalTokens && firebaseUser) {
      const apiUrl = `${documentInfo.portalUrl}api/v1/external_activities/create`
      const templateId = Document.StringifyTemplateHashParam(firebaseUser.uid, document.id)
      const templateUrl = `${window.location.origin}${window.location.pathname}#template=${templateId}`
      superagent
        .get(apiUrl)
        .query({name: documentInfo.name, url: templateUrl, append_auth_token: 1})
        .set("Authorization", `Bearer/JWT ${portalTokens.rawPortalJWT}`)
        .end((err, res) => {
          if (err) {
            alert((res.body ? res.body.message : null) || err)
          }
          else if (!res.body || !res.body.edit_url) {
            alert("No edit url found in create activity response")
          }
          else {
            documentInfo.portalEditUrl = res.body.edit_url
            this.infoRef.set(documentInfo)
            setTimeout(() => alert("The portal activity was created"), 10)
          }
        })
    }
  }

  handleEditActivityButton = () => {
    const {documentInfo} = this.state
    if (documentInfo && documentInfo.portalEditUrl) {
      window.location.href = documentInfo.portalEditUrl
    }
  }

  renderDocumentInfo() {
    const {documentInfo} = this.state
    if (!documentInfo) {
      return null
    }
    return (
      <div className="document-info">
        <div className="document-name">
          {this.props.setTitle ? <InlineEditorComponent text={documentInfo.name} changeText={this.handleChangeDocumentName} /> : documentInfo.name}
        </div>
        <div className="instance-info" title={this.state.debugInfo}>{this.state.workspaceName}</div>
      </div>
    )
  }

  renderGroupInfo() {
    const {portalOffering} = this.props
    const {groupUsers} = this.state
    if (!groupUsers || !portalOffering) {
      return null
    }
    const users:JSX.Element[] = []
    Object.keys(groupUsers).forEach((id) => {
      const groupUser = groupUsers[id]
      const portalUser = this.userLookup.lookup(id)
      if (portalUser) {
        const {connected} = groupUser
        const className = `group-user ${groupUser.connected ? "connected" : "disconnected"}`
        const titleSuffix = groupUser.connected ? `connected ${timeagoInstance.format(groupUser.connectedAt)}` : `disconnected ${timeagoInstance.format(groupUser.disconnectedAt)}`
        users.push(<div key={id} className={className} title={`${portalUser.fullName}: ${titleSuffix}`}>{portalUser.initials}</div>)
      }
    })
    return (
      <div className="group-info"><div className="group-name clickable" onClick={this.handlePromptToChangeGroup} title="Click to leave group">Group {this.props.group}</div>{users}</div>
    )
  }

  renderHeader() {
    const {firebaseUser, portalUser} = this.props
    const className = `header${this.props.isTemplate ? " template" : ""}`
    const userName = portalUser ? portalUser.fullName : (firebaseUser.isAnonymous ? "Anonymous User" : firebaseUser.displayName)
    return (
      <div className={className}>
        {this.renderDocumentInfo()}
        <div className="user-info">
          <div className="user-name" title={firebaseUser.uid}>{userName}</div>
        </div>
        {this.renderGroupInfo()}
      </div>
    )
  }

  renderPublicationToolbar() {
    const { publication } = this.props
    if (!publication) {
      return null
    }
    const {creator, createdAt} = publication
    const user = this.userLookup.lookup(creator)
    const name = user ? user.fullName : "Unknown User"
    const message = `Published ${timeagoInstance.format(createdAt)} by ${name} in group ${publication.group}`
    return (
      <div className="buttons">
        <div className="left-buttons">
          <div className="readonly-message">{message}</div>
        </div>
        <div className="right-buttons">
          <button type="button" onClick={this.handleViewAllPublications}>View All Publications</button>
        </div>
      </div>
    )
  }

  renderReadonlyTemplateToolbar() {
    return (
      <div className="readonly-message">View only.  You do not have edit access to this template.</div>
    )
  }

  renderReadonlyToolbar() {
    return this.props.isTemplate ? this.renderReadonlyTemplateToolbar() : this.renderPublicationToolbar()
  }

  renderToolbarButtons() {
    const {document} = this.props
    const {documentInfo} = this.state
    const showCreateActivityButton = documentInfo && documentInfo.portalUrl && !documentInfo.portalEditUrl && !document.isReadonly
    const showEditActivityButton = documentInfo && documentInfo.portalUrl && documentInfo.portalEditUrl && !document.isReadonly && this.props.isTemplate
    const editActivityUrl = documentInfo && documentInfo.portalEditUrl
    const showDemoButton = this.props.isTemplate && !document.isReadonly
    const showPublishButton = !this.props.isTemplate && !document.isReadonly
    return (
      <div className="buttons">
        <div className="left-buttons">
          <button type="button" onClick={this.handleAddDrawingButton}>Add Drawing</button>
          <button type="button" onClick={this.handleAddCaseTable}>Add Table</button>
          <button type="button" onClick={this.handleAddCaseTableAndGraph}>Add Table &amp; Graph</button>
          </div>
        <div className="right-buttons">
          {showCreateActivityButton ? <button type="button" onClick={this.handleCreateActivityButton}>Create Portal Activity</button> : null}
          {showEditActivityButton && editActivityUrl ? <a className="button" href={editActivityUrl} target="_blank">Edit Portal Activity</a> : null}
          {showDemoButton ? <button type="button" onClick={this.handleCreateDemoButton}>Create Demo</button> : null}
          {showPublishButton ? <button type="button" disabled={this.state.publishing} onClick={this.handlePublishButton}>Publish</button> : null}
        </div>
      </div>
    )
  }

  renderToolbar() {
    return (
      <div className="toolbar">
        {this.props.document.isReadonly ? this.renderReadonlyToolbar() : this.renderToolbarButtons()}
      </div>
    )
  }

  renderAllWindows() {
    const {allOrderedWindows, topWindow} = this.state
    return allOrderedWindows.map((orderedWindow) => {
      const {window} = orderedWindow
      return <WindowComponent
               key={window.id}
               window={window}
               isTopWindow={window === topWindow}
               zIndex={orderedWindow.order}
               windowManager={this.windowManager}
               isTemplate={this.props.isTemplate}
               isReadonly={this.props.document.isReadonly}
             />
    })
  }

  renderMinimizedWindows() {
    const windows = this.state.minimizedWindows.map((window) => {
      return <MinimizedWindowComponent
               key={window.id}
               window={window}
               windowManager={this.windowManager}
             />
    })
    return (
      <div className="minimized">{windows}</div>
    )
  }

  renderWindowArea() {
    const hasMinmizedWindows = this.state.minimizedWindows.length > 0
    const nonMinimizedClassName = `non-minimized${hasMinmizedWindows ? " with-minimized" : ""}`
    const className = `window-area${!this.props.isTemplate && !this.props.document.isReadonly ? " with-sidebar" : ""}`
    return (
      <div className={className}>
        <div className={nonMinimizedClassName}>
          {this.renderAllWindows()}
        </div>
        {hasMinmizedWindows ? this.renderMinimizedWindows() : null}
      </div>
    )
  }

  renderReadonlyBlocker() {
    if (this.props.isTemplate && this.props.document.isReadonly) {
      return <div className="readonly-blocker" />
    }
    return null
  }

  renderSidebarComponent() {
    const {portalOffering, portalUser, portalTokens, group} = this.props
    if (!portalOffering || !portalUser || !portalTokens || !group) {
      return null
    }
    return <SidebarComponent
             portalOffering={portalOffering}
             portalUser={portalUser}
             portalTokens={portalTokens}
             group={group}
             toggleViewArtifact={this.handleToggleViewArtifact}
             publishing={this.state.publishing}
             windowManager={this.windowManager}
           />
  }

  renderArtifact() {
    if (!this.state.viewArtifact) {
      return null
    }
    return (
      <div className="image-lightbox" onClick={this.handleClearViewArtifact}>
        <div className="image-lightbox-background" />
        <div className="image-lightbox-image">
          <div>
            <img src={this.state.viewArtifact.url} draggable={false} />
          </div>
        </div>
      </div>
    )
  }

  render() {
    return (
      <div className="workspace" onDrop={this.handleDrop} onDragOver={this.handleDragOver}>
        {this.renderHeader()}
        {this.renderToolbar()}
        {this.renderWindowArea()}
        {this.renderSidebarComponent()}
        {this.renderArtifact()}
        {this.renderReadonlyBlocker()}
      </div>
    )
  }
}